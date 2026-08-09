const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const pool = require('../db/pool');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { sendStatusChangeEmail, sendDefectRaisedEmail, sendTeamReassignEmail } = require('../services/email');
const { sendSlackChannelNotification } = require('../services/slack');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ── Permission matrix ──────────────────────────────────────────────────────────
const canChangeStatus = (role, oldStatus, newStatus) => {
  if (role === 'pm' || role === 'admin') return true;

  if (role === 'qa') {
    if (newStatus === 'Retest') return false;
    if (newStatus === 'Need Clarification') return false;
    if (newStatus === 'Open' && oldStatus === 'Need Clarification') return true;
    if (newStatus === 'Closed') return true;
    if (newStatus === 'Reopen') return true;
    return false;
  }

  if (role === 'developer') {
    if (newStatus === 'Retest') return true;
    if (newStatus === 'Need Clarification') return true;
    return false;
  }

  return false;
};

const buildDefectQuery = (filters, userRole, userId, userTeam) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (userRole === 'developer') {
    conditions.push(`d.assigned_team = :${idx++}`);
    params.push(userTeam);
  }

  if (filters.project_id) {
    conditions.push(`d.project_id = :${idx++}`);
    params.push(filters.project_id);
  }
  if (filters.status) {
    conditions.push(`d.status = :${idx++}`);
    params.push(filters.status);
  }
  if (filters.severity) {
    conditions.push(`d.severity = :${idx++}`);
    params.push(filters.severity);
  }
  if (filters.assigned_team) {
    conditions.push(`d.assigned_team = :${idx++}`);
    params.push(filters.assigned_team);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  return { where, params };
};

// GET /api/defects/search?q= — search by title or id, top 10
router.get('/search', authenticateToken, async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length === 0) return res.json([]);
  try {
    const isNum = /^\d+$/.test(q.trim());
    let result;
    if (isNum) {
      result = await pool.query(
        `SELECT * FROM (SELECT d.id, d.title, d.status, d.severity FROM defects d WHERE d.id = :1) WHERE ROWNUM <= 10`,
        [parseInt(q)]
      );
    } else {
      result = await pool.query(
        `SELECT * FROM (SELECT d.id, d.title, d.status, d.severity FROM defects d WHERE UPPER(d.title) LIKE UPPER(:1) ORDER BY d.created_at DESC) WHERE ROWNUM <= 10`,
        [`%${q.trim()}%`]
      );
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/defects/stats — PM charts
router.get('/stats', authenticateToken, requireRole('pm', 'admin'), async (req, res) => {
  try {
    const [byStatus, byTeam, overTime] = await Promise.all([
      pool.query(`SELECT status, COUNT(*) AS count FROM defects GROUP BY status`),
      pool.query(`SELECT assigned_team AS team, COUNT(*) AS count FROM defects WHERE assigned_team IS NOT NULL GROUP BY assigned_team`),
      pool.query(`
        SELECT * FROM (
          SELECT TRUNC(created_at, 'DD') AS created_date, COUNT(*) AS count
          FROM defects
          GROUP BY TRUNC(created_at, 'DD')
          ORDER BY TRUNC(created_at, 'DD') ASC
        ) WHERE ROWNUM <= 30
      `),
    ]);

    res.json({
      byStatus: byStatus.rows,
      byTeam: byTeam.rows,
      overTime: overTime.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/defects/export/csv — PM only (must be BEFORE /:id)
router.get('/export/csv', authenticateToken, requireRole('pm', 'admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.id, d.title, p.name AS project,
        d.environment, d.severity, d.status, d.assigned_team,
        u1.name AS raised_by, d.created_at, d.updated_at
      FROM defects d
      LEFT JOIN projects p ON d.project_id = p.id
      LEFT JOIN users u1 ON d.raised_by_user_id = u1.id
      ORDER BY d.created_at DESC
    `);

    const headers = ['ID', 'Title', 'Project', 'Environment', 'Severity', 'Status', 'Assigned Team', 'Raised By', 'Created At', 'Updated At'];
    const rows = result.rows.map(r => [
      r.id, `"${r.title}"`, `"${r.project || ''}"`,
      r.environment, r.severity, r.status, r.assigned_team || '',
      `"${r.raised_by || ''}"`, r.created_at, r.updated_at,
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="defects.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/defects
router.get('/', authenticateToken, async (req, res) => {
  const { project_id, status, severity, assigned_team } = req.query;
  const { where, params } = buildDefectQuery(
    { project_id, status, severity, assigned_team },
    req.user.role, req.user.id, req.user.team
  );

  try {
    const result = await pool.query(`
      SELECT d.*,
        p.name AS project_name,
        u1.name AS raised_by_name,
        u2.name AS assigned_to_name,
        u3.name AS clarification_assigned_to_name
      FROM defects d
      LEFT JOIN projects p ON d.project_id = p.id
      LEFT JOIN users u1 ON d.raised_by_user_id = u1.id
      LEFT JOIN users u2 ON d.assigned_to_user_id = u2.id
      LEFT JOIN users u3 ON d.clarification_assigned_to = u3.id
      ${where}
      ORDER BY d.created_at DESC
    `, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/defects/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const defectResult = await pool.query(`
      SELECT d.*,
        p.name AS project_name,
        u1.name AS raised_by_name,
        u1.email AS raised_by_email,
        u2.name AS assigned_to_name,
        u3.name AS clarification_assigned_to_name,
        u3.email AS clarif_assigned_to_email
      FROM defects d
      LEFT JOIN projects p ON d.project_id = p.id
      LEFT JOIN users u1 ON d.raised_by_user_id = u1.id
      LEFT JOIN users u2 ON d.assigned_to_user_id = u2.id
      LEFT JOIN users u3 ON d.clarification_assigned_to = u3.id
      WHERE d.id = :1
    `, [req.params.id]);

    if (defectResult.rows.length === 0) return res.status(404).json({ error: 'Defect not found' });

    const attachmentsResult = await pool.query(
      'SELECT a.*, u.name AS uploaded_by_name FROM attachments a LEFT JOIN users u ON a.uploaded_by = u.id WHERE a.defect_id = :1 ORDER BY a.uploaded_at ASC',
      [req.params.id]
    );

    const commentsResult = await pool.query(
      'SELECT c.*, u.name AS user_name, u.role AS user_role FROM comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.defect_id = :1 ORDER BY c.created_at ASC',
      [req.params.id]
    );

    const auditResult = await pool.query(
      'SELECT a.*, u.name AS changed_by_name FROM audit_log a LEFT JOIN users u ON a.changed_by_user_id = u.id WHERE a.defect_id = :1 ORDER BY a.changed_at ASC',
      [req.params.id]
    );

    res.json({
      ...defectResult.rows[0],
      attachments: attachmentsResult.rows,
      comments: commentsResult.rows,
      audit_log: auditResult.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/defects — QA, PM, or admin raises defect
router.post('/', authenticateToken, requireRole('qa', 'pm', 'admin'), upload.array('attachments', 10), async (req, res) => {
  const { title, project_id, environment, severity, steps_to_reproduce, assigned_team } = req.body;
  if (!title || !project_id || !environment || !severity || !assigned_team) {
    return res.status(400).json({ error: 'Required fields missing' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      INSERT INTO defects (title, project_id, environment, severity, steps_to_reproduce, status, assigned_team, raised_by_user_id)
      VALUES (:1, :2, :3, :4, :5, 'Open', :6, :7)
    `, [title, project_id, environment, severity, steps_to_reproduce || null, assigned_team, req.user.id]);

    // Fetch the newly inserted defect (by title + raised_by + most recent)
    const defectResult = await client.query(`
      SELECT * FROM (
        SELECT * FROM defects
        WHERE raised_by_user_id = :1 AND title = :2
        ORDER BY created_at DESC
      ) WHERE ROWNUM = 1
    `, [req.user.id, title]);

    const defect = defectResult.rows[0];
    if (!defect) throw new Error('Failed to retrieve newly inserted defect');

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await client.query(
          'INSERT INTO attachments (defect_id, file_path, file_name, uploaded_by) VALUES (:1, :2, :3, :4)',
          [defect.id, path.basename(file.path), file.originalname, req.user.id]
        );
      }
    }

    await client.query(
      'INSERT INTO audit_log (defect_id, changed_by_user_id, old_status, new_status, note) VALUES (:1, :2, NULL, :3, :4)',
      [defect.id, req.user.id, 'Open', 'Defect raised']
    );

    await client.query('COMMIT');

    // Notify every active member of the assigned team
    const teamMembers = await pool.query(
      'SELECT email FROM users WHERE team = :1 AND is_active = 1 AND email IS NOT NULL',
      [assigned_team]
    );
    const recipients = teamMembers.rows.map(r => r.email);

    sendDefectRaisedEmail({ defect, raisedBy: req.user.name, recipients }).catch(() => {});
    sendSlackChannelNotification({
      defect,
      message: `🐛 New Defect #${defect.id} raised: *${defect.title}*`,
      changedBy: req.user.name,
    }).catch(() => {});

    res.status(201).json(defect);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// PATCH /api/defects/:id — edit defect fields (QA who raised it, PM, Admin)
router.patch('/:id', authenticateToken, async (req, res) => {
  const { title, environment, severity, steps_to_reproduce, assigned_team } = req.body;
  const role = req.user.role;

  const client = await pool.connect();
  try {
    const current = await client.query('SELECT * FROM defects WHERE id = :1', [req.params.id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Defect not found' });
    const defect = current.rows[0];

    if (role === 'developer') return res.status(403).json({ error: 'Developers cannot edit defect fields' });
    if (role === 'qa' && defect.raised_by_user_id !== req.user.id) return res.status(403).json({ error: 'You can only edit defects you raised' });

    await client.query('BEGIN');

    await client.query(`
      UPDATE defects SET
        title = COALESCE(:1, title),
        environment = COALESCE(:2, environment),
        severity = COALESCE(:3, severity),
        steps_to_reproduce = COALESCE(:4, steps_to_reproduce),
        assigned_team = COALESCE(:5, assigned_team),
        edited_at = SYSTIMESTAMP,
        updated_at = SYSTIMESTAMP
      WHERE id = :6
    `, [title || null, environment || null, severity || null,
        steps_to_reproduce !== undefined ? steps_to_reproduce : null,
        assigned_team || null, req.params.id]);

    await client.query(
      'INSERT INTO audit_log (defect_id, changed_by_user_id, old_status, new_status, note) VALUES (:1, :2, :3, :4, :5)',
      [req.params.id, req.user.id, defect.status, defect.status, `Defect edited by ${req.user.name}`]
    );

    await client.query('COMMIT');

    const result = await pool.query('SELECT * FROM defects WHERE id = :1', [req.params.id]);
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// PATCH /api/defects/:id/status — change status with permission enforcement
router.patch('/:id/status', authenticateToken, async (req, res) => {
  const { status, note, clarification_assigned_to, assigned_team } = req.body;
  const validStatuses = ['Open', 'Need Clarification', 'Retest', 'Reopen', 'Closed'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  if (status === 'Need Clarification' && !clarification_assigned_to) {
    return res.status(400).json({ error: 'clarification_assigned_to is required for Need Clarification status' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query(`
      SELECT d.*, u.email AS raised_email, u.name AS raised_name
      FROM defects d LEFT JOIN users u ON d.raised_by_user_id = u.id
      WHERE d.id = :1
    `, [req.params.id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Defect not found' });

    const defect = current.rows[0];
    const oldStatus = defect.status;
    const role = req.user.role;

    if (!canChangeStatus(role, oldStatus, status)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: `Your role (${role}) cannot change status to "${status}" from "${oldStatus}"` });
    }

    // Determine clarification_assigned_to value
    let clarAssigned = null;
    if (status === 'Need Clarification') clarAssigned = clarification_assigned_to;

    // Determine assigned_team for team-change transitions
    let newTeam = null;
    if (status === 'Open' && oldStatus === 'Need Clarification' && assigned_team) newTeam = assigned_team;
    if (status === 'Reopen' && assigned_team) newTeam = assigned_team;

    await client.query(`
      UPDATE defects SET
        status = :1,
        clarification_assigned_to = :2,
        assigned_team = COALESCE(:3, assigned_team),
        updated_at = SYSTIMESTAMP
      WHERE id = :4
    `, [status, clarAssigned, newTeam, req.params.id]);

    await client.query(
      'INSERT INTO audit_log (defect_id, changed_by_user_id, old_status, new_status, note) VALUES (:1, :2, :3, :4, :5)',
      [req.params.id, req.user.id, oldStatus, status, note || null]
    );

    await client.query('COMMIT');

    // ── Notifications ──────────────────────────────────────────────────────────
    if (status === 'Need Clarification') {
      const qaUser = await pool.query('SELECT email FROM users WHERE id = :1', [clarification_assigned_to]);
      const qaEmail = qaUser.rows[0]?.email;
      if (qaEmail) {
        sendStatusChangeEmail({ defect, oldStatus, newStatus: status, changedBy: req.user.name, recipients: [qaEmail] }).catch(() => {});
      }
    } else {
      const pmEmails = await pool.query('SELECT email FROM users WHERE role = :1 AND is_active = 1 AND email IS NOT NULL', ['pm']);
      const recipients = [
        defect.raised_email,
        ...pmEmails.rows.map(r => r.email),
      ].filter(Boolean);
      sendStatusChangeEmail({ defect, oldStatus, newStatus: status, changedBy: req.user.name, recipients }).catch(() => {});
    }

    sendSlackChannelNotification({
      defect,
      message: `🔄 Defect #${defect.id} status updated`,
      changedBy: req.user.name,
      oldStatus,
      newStatus: status,
    }).catch(() => {});

    const updated = await pool.query(`
      SELECT d.*, p.name AS project_name,
        u1.name AS raised_by_name, u2.name AS assigned_to_name,
        u3.name AS clarification_assigned_to_name
      FROM defects d
      LEFT JOIN projects p ON d.project_id = p.id
      LEFT JOIN users u1 ON d.raised_by_user_id = u1.id
      LEFT JOIN users u2 ON d.assigned_to_user_id = u2.id
      LEFT JOIN users u3 ON d.clarification_assigned_to = u3.id
      WHERE d.id = :1
    `, [req.params.id]);

    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// PATCH /api/defects/:id/team — Developer or Admin reassigns the defect to a different team
router.patch('/:id/team', authenticateToken, requireRole('developer', 'admin'), async (req, res) => {
  const { assigned_team } = req.body;
  const validTeams = ['dev', 'fmw', 'mobility'];
  if (!assigned_team || !validTeams.includes(assigned_team)) {
    return res.status(400).json({ error: 'Invalid team. Must be dev, fmw, or mobility.' });
  }

  const client = await pool.connect();
  try {
    const current = await client.query(
      'SELECT d.*, u.email AS raised_email FROM defects d LEFT JOIN users u ON d.raised_by_user_id = u.id WHERE d.id = :1',
      [req.params.id]
    );
    if (current.rows.length === 0) return res.status(404).json({ error: 'Defect not found' });

    const defect = current.rows[0];
    const oldTeam = defect.assigned_team;

    if (oldTeam === assigned_team) {
      return res.status(400).json({ error: 'Defect is already assigned to that team.' });
    }

    await client.query('BEGIN');

    await client.query(
      'UPDATE defects SET assigned_team = :1, updated_at = SYSTIMESTAMP WHERE id = :2',
      [assigned_team, req.params.id]
    );

    const auditNote = `Reassigned from ${(oldTeam || '—').toUpperCase()} to ${assigned_team.toUpperCase()} by ${req.user.name}`;
    await client.query(
      'INSERT INTO audit_log (defect_id, changed_by_user_id, old_status, new_status, note) VALUES (:1, :2, :3, :4, :5)',
      [req.params.id, req.user.id, defect.status, defect.status, auditNote]
    );

    await client.query('COMMIT');

    // ── Notifications ────────────────────────────────────────────────────────
    const pmEmails = await pool.query(
      'SELECT email FROM users WHERE role = :1 AND is_active = 1 AND email IS NOT NULL', ['pm']
    );
    const recipients = [defect.raised_email, ...pmEmails.rows.map(r => r.email)].filter(Boolean);

    sendTeamReassignEmail({
      defect: { ...defect, assigned_team },
      oldTeam,
      newTeam: assigned_team,
      reassignedBy: req.user.name,
      recipients,
    }).catch(() => {});

    sendSlackChannelNotification({
      defect: { ...defect, assigned_team },
      message: `🔀 Defect #${defect.id} reassigned: ${(oldTeam || '—').toUpperCase()} → ${assigned_team.toUpperCase()}`,
      changedBy: req.user.name,
    }).catch(() => {});

    const updated = await pool.query(`
      SELECT d.*, p.name AS project_name,
        u1.name AS raised_by_name, u2.name AS assigned_to_name,
        u3.name AS clarification_assigned_to_name
      FROM defects d
      LEFT JOIN projects p ON d.project_id = p.id
      LEFT JOIN users u1 ON d.raised_by_user_id = u1.id
      LEFT JOIN users u2 ON d.assigned_to_user_id = u2.id
      LEFT JOIN users u3 ON d.clarification_assigned_to = u3.id
      WHERE d.id = :1
    `, [req.params.id]);

    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// POST /api/defects/:id/attachments — add attachments after creation
router.post('/:id/attachments', authenticateToken, upload.array('attachments', 10), async (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
  try {
    for (const file of req.files) {
      await pool.query(
        'INSERT INTO attachments (defect_id, file_path, file_name, uploaded_by) VALUES (:1, :2, :3, :4)',
        [req.params.id, path.basename(file.path), file.originalname, req.user.id]
      );
    }
    const inserted = await pool.query(
      'SELECT * FROM (SELECT a.*, u.name AS uploaded_by_name FROM attachments a LEFT JOIN users u ON a.uploaded_by = u.id WHERE a.defect_id = :1 ORDER BY a.uploaded_at DESC) WHERE ROWNUM <= :2',
      [req.params.id, req.files.length]
    );
    res.status(201).json(inserted.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/defects/:id/attachments/:attachmentId
router.delete('/:id/attachments/:attachmentId', authenticateToken, async (req, res) => {
  try {
    const att = await pool.query('SELECT * FROM attachments WHERE id = :1 AND defect_id = :2', [req.params.attachmentId, req.params.id]);
    if (att.rows.length === 0) return res.status(404).json({ error: 'Attachment not found' });

    const attachment = att.rows[0];
    const role = req.user.role;

    if (role !== 'pm' && role !== 'admin' && attachment.uploaded_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own attachments' });
    }

    await pool.query('DELETE FROM attachments WHERE id = :1', [req.params.attachmentId]);
    res.json({ message: 'Attachment deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/defects/:id/comments
router.post('/:id/comments', authenticateToken, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });
  try {
    await pool.query(
      'INSERT INTO comments (defect_id, user_id, message) VALUES (:1, :2, :3)',
      [req.params.id, req.user.id, message]
    );
    const withUser = await pool.query(
      `SELECT * FROM (
         SELECT c.*, u.name AS user_name, u.role AS user_role
         FROM comments c JOIN users u ON c.user_id = u.id
         WHERE c.defect_id = :1 AND c.user_id = :2
         ORDER BY c.created_at DESC
       ) WHERE ROWNUM = 1`,
      [req.params.id, req.user.id]
    );
    res.status(201).json(withUser.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
