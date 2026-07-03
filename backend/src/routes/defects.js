const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const pool = require('../db/pool');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { sendStatusChangeEmail, sendDefectRaisedEmail } = require('../services/email');
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
// Returns true if the role is allowed to transition to newStatus from oldStatus
const canChangeStatus = (role, oldStatus, newStatus) => {
  if (role === 'pm' || role === 'admin') return true;

  if (role === 'qa') {
    if (newStatus === 'Retest') return false; // only dev/fmw/mobility can set Retest
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

  // QA sees all defects (own + clarification assigned to them)
  // Developer sees defects assigned to their team
  if (userRole === 'developer') {
    conditions.push(`d.assigned_team = $${idx++}`);
    params.push(userTeam);
  }

  if (filters.project_id) {
    conditions.push(`d.project_id = $${idx++}`);
    params.push(filters.project_id);
  }
  if (filters.module_id) {
    conditions.push(`d.module_id = $${idx++}`);
    params.push(filters.module_id);
  }
  if (filters.status) {
    conditions.push(`d.status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters.severity) {
    conditions.push(`d.severity = $${idx++}`);
    params.push(filters.severity);
  }
  if (filters.assigned_team) {
    conditions.push(`d.assigned_team = $${idx++}`);
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
        `SELECT d.id, d.title, d.status, d.severity FROM defects d WHERE d.id = $1 LIMIT 10`,
        [parseInt(q)]
      );
    } else {
      result = await pool.query(
        `SELECT d.id, d.title, d.status, d.severity FROM defects d WHERE d.title ILIKE $1 ORDER BY d.created_at DESC LIMIT 10`,
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
    const [byModule, byStatus, byTeam, overTime] = await Promise.all([
      pool.query(`
        SELECT m.name as module, COUNT(*) as count
        FROM defects d
        LEFT JOIN modules m ON d.module_id = m.id
        GROUP BY m.name ORDER BY count DESC
      `),
      pool.query(`SELECT status, COUNT(*) as count FROM defects GROUP BY status`),
      pool.query(`SELECT assigned_team as team, COUNT(*) as count FROM defects WHERE assigned_team IS NOT NULL GROUP BY assigned_team`),
      pool.query(`
        SELECT DATE_TRUNC('day', created_at) as date, COUNT(*) as count
        FROM defects GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY date ASC LIMIT 30
      `),
    ]);

    res.json({
      byModule: byModule.rows,
      byStatus: byStatus.rows,
      byTeam: byTeam.rows,
      overTime: overTime.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/defects/export/csv — PM only (must be BEFORE /:id)
router.get('/export/csv', authenticateToken, requireRole('pm', 'admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.id, d.title, p.name as project, m.name as module,
        d.environment, d.severity, d.status, d.assigned_team,
        u1.name as raised_by, d.created_at, d.updated_at
      FROM defects d
      LEFT JOIN projects p ON d.project_id = p.id
      LEFT JOIN modules m ON d.module_id = m.id
      LEFT JOIN users u1 ON d.raised_by_user_id = u1.id
      ORDER BY d.created_at DESC
    `);

    const headers = ['ID', 'Title', 'Project', 'Module', 'Environment', 'Severity', 'Status', 'Assigned Team', 'Raised By', 'Created At', 'Updated At'];
    const rows = result.rows.map(r => [
      r.id, `"${r.title}"`, `"${r.project || ''}"`, `"${r.module || ''}"`,
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
  const { project_id, module_id, status, severity, assigned_team } = req.query;
  const { where, params } = buildDefectQuery(
    { project_id, module_id, status, severity, assigned_team },
    req.user.role, req.user.id, req.user.team
  );

  try {
    const result = await pool.query(`
      SELECT d.*,
        p.name as project_name,
        m.name as module_name,
        u1.name as raised_by_name,
        u2.name as assigned_to_name,
        u3.name as clarification_assigned_to_name
      FROM defects d
      LEFT JOIN projects p ON d.project_id = p.id
      LEFT JOIN modules m ON d.module_id = m.id
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
        p.name as project_name,
        m.name as module_name,
        u1.name as raised_by_name,
        u1.email as raised_by_email,
        u2.name as assigned_to_name,
        u3.name as clarification_assigned_to_name,
        u3.email as clarification_assigned_to_email
      FROM defects d
      LEFT JOIN projects p ON d.project_id = p.id
      LEFT JOIN modules m ON d.module_id = m.id
      LEFT JOIN users u1 ON d.raised_by_user_id = u1.id
      LEFT JOIN users u2 ON d.assigned_to_user_id = u2.id
      LEFT JOIN users u3 ON d.clarification_assigned_to = u3.id
      WHERE d.id = $1
    `, [req.params.id]);

    if (defectResult.rows.length === 0) return res.status(404).json({ error: 'Defect not found' });

    const attachmentsResult = await pool.query(
      'SELECT a.*, u.name as uploaded_by_name FROM attachments a LEFT JOIN users u ON a.uploaded_by = u.id WHERE a.defect_id = $1 ORDER BY a.uploaded_at ASC',
      [req.params.id]
    );

    const commentsResult = await pool.query(
      'SELECT c.*, u.name as user_name, u.role as user_role FROM comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.defect_id = $1 ORDER BY c.created_at ASC',
      [req.params.id]
    );

    const auditResult = await pool.query(
      'SELECT a.*, u.name as changed_by_name FROM audit_log a LEFT JOIN users u ON a.changed_by_user_id = u.id WHERE a.defect_id = $1 ORDER BY a.changed_at ASC',
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
  const { title, project_id, module_id, environment, severity, steps_to_reproduce, assigned_team } = req.body;
  if (!title || !project_id || !environment || !severity || !assigned_team) {
    return res.status(400).json({ error: 'Required fields missing' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const defectResult = await client.query(`
      INSERT INTO defects (title, project_id, module_id, environment, severity, steps_to_reproduce, status, assigned_team, raised_by_user_id)
      VALUES ($1, $2, $3, $4, $5, $6, 'Open', $7, $8)
      RETURNING *
    `, [title, project_id, module_id || null, environment, severity, steps_to_reproduce || '', assigned_team, req.user.id]);

    const defect = defectResult.rows[0];

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await client.query(
          'INSERT INTO attachments (defect_id, file_path, file_name, uploaded_by) VALUES ($1, $2, $3, $4)',
          [defect.id, file.path, file.originalname, req.user.id]
        );
      }
    }

    await client.query(
      'INSERT INTO audit_log (defect_id, changed_by_user_id, old_status, new_status, note) VALUES ($1, $2, NULL, $3, $4)',
      [defect.id, req.user.id, 'Open', 'Defect raised']
    );

    await client.query('COMMIT');

    // Notify PMs on new defect
    const pmEmails = await pool.query('SELECT email FROM users WHERE role = $1 AND is_active = TRUE AND email IS NOT NULL', ['pm']);
    const recipients = pmEmails.rows.map(r => r.email).filter(Boolean);

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
  const { title, module_id, environment, severity, steps_to_reproduce, assigned_team } = req.body;
  const role = req.user.role;

  const client = await pool.connect();
  try {
    const current = await client.query('SELECT * FROM defects WHERE id = $1', [req.params.id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Defect not found' });
    const defect = current.rows[0];

    // Permission: QA who raised it, PM, Admin
    if (role === 'developer') return res.status(403).json({ error: 'Developers cannot edit defect fields' });
    if (role === 'qa' && defect.raised_by_user_id !== req.user.id) return res.status(403).json({ error: 'You can only edit defects you raised' });

    await client.query('BEGIN');

    const result = await client.query(`
      UPDATE defects SET
        title = COALESCE($1, title),
        module_id = COALESCE($2, module_id),
        environment = COALESCE($3, environment),
        severity = COALESCE($4, severity),
        steps_to_reproduce = COALESCE($5, steps_to_reproduce),
        assigned_team = COALESCE($6, assigned_team),
        edited_at = NOW(),
        updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `, [title || null, module_id || null, environment || null, severity || null, steps_to_reproduce !== undefined ? steps_to_reproduce : null, assigned_team || null, req.params.id]);

    await client.query(
      'INSERT INTO audit_log (defect_id, changed_by_user_id, old_status, new_status, note) VALUES ($1, $2, $3, $4, $5)',
      [req.params.id, req.user.id, defect.status, defect.status, `Defect edited by ${req.user.name}`]
    );

    await client.query('COMMIT');
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

  // Need Clarification requires a QA user to be specified
  if (status === 'Need Clarification' && !clarification_assigned_to) {
    return res.status(400).json({ error: 'clarification_assigned_to is required for Need Clarification status' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query(`
      SELECT d.*, u.email as raised_email, u.name as raised_name
      FROM defects d LEFT JOIN users u ON d.raised_by_user_id = u.id
      WHERE d.id = $1
    `, [req.params.id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Defect not found' });

    const defect = current.rows[0];
    const oldStatus = defect.status;
    const role = req.user.role;

    // Enforce permission matrix
    if (!canChangeStatus(role, oldStatus, status)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: `Your role (${role}) cannot change status to "${status}" from "${oldStatus}"` });
    }

    // Build update fields
    const updateFields = {
      status,
      updated_at: 'NOW()',
      clarification_assigned_to: status === 'Need Clarification' ? clarification_assigned_to : null,
    };

    // When QA responds to clarification, reset clarification_assigned_to
    if (status === 'Open' && oldStatus === 'Need Clarification') {
      updateFields.clarification_assigned_to = null;
      // Update assigned_team if QA selected a new team
      if (assigned_team) updateFields.assigned_team = assigned_team;
    }

    // When reopening, update assigned_team if provided
    if (status === 'Reopen' && assigned_team) {
      updateFields.assigned_team = assigned_team;
    }

    await client.query(`
      UPDATE defects SET
        status = $1,
        clarification_assigned_to = $2,
        assigned_team = COALESCE($3, assigned_team),
        updated_at = NOW()
      WHERE id = $4
    `, [
      status,
      updateFields.clarification_assigned_to || null,
      (status === 'Open' && oldStatus === 'Need Clarification' && assigned_team) || (status === 'Reopen' && assigned_team) ? assigned_team : null,
      req.params.id,
    ]);

    await client.query(
      'INSERT INTO audit_log (defect_id, changed_by_user_id, old_status, new_status, note) VALUES ($1, $2, $3, $4, $5)',
      [req.params.id, req.user.id, oldStatus, status, note || null]
    );

    await client.query('COMMIT');

    // ── Notifications ──────────────────────────────────────────────────────────
    // Need Clarification: notify only the assigned QA
    if (status === 'Need Clarification') {
      const qaUser = await pool.query('SELECT email FROM users WHERE id = $1', [clarification_assigned_to]);
      const qaEmail = qaUser.rows[0]?.email;
      if (qaEmail) {
        sendStatusChangeEmail({ defect, oldStatus, newStatus: status, changedBy: req.user.name, recipients: [qaEmail] }).catch(() => {});
      }
    } else {
      // All other transitions: notify QA who raised + all PMs
      const pmEmails = await pool.query('SELECT email FROM users WHERE role = $1 AND is_active = TRUE AND email IS NOT NULL', ['pm']);
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
      SELECT d.*, p.name as project_name, m.name as module_name,
        u1.name as raised_by_name, u2.name as assigned_to_name,
        u3.name as clarification_assigned_to_name
      FROM defects d
      LEFT JOIN projects p ON d.project_id = p.id
      LEFT JOIN modules m ON d.module_id = m.id
      LEFT JOIN users u1 ON d.raised_by_user_id = u1.id
      LEFT JOIN users u2 ON d.assigned_to_user_id = u2.id
      LEFT JOIN users u3 ON d.clarification_assigned_to = u3.id
      WHERE d.id = $1
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
    const inserted = [];
    for (const file of req.files) {
      const r = await pool.query(
        'INSERT INTO attachments (defect_id, file_path, file_name, uploaded_by) VALUES ($1, $2, $3, $4) RETURNING *',
        [req.params.id, file.path, file.originalname, req.user.id]
      );
      inserted.push(r.rows[0]);
    }
    res.status(201).json(inserted);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/defects/:id/attachments/:attachmentId
router.delete('/:id/attachments/:attachmentId', authenticateToken, async (req, res) => {
  try {
    const att = await pool.query('SELECT * FROM attachments WHERE id = $1 AND defect_id = $2', [req.params.attachmentId, req.params.id]);
    if (att.rows.length === 0) return res.status(404).json({ error: 'Attachment not found' });

    const attachment = att.rows[0];
    const role = req.user.role;

    // Permission: uploader, PM, Admin
    if (role !== 'pm' && role !== 'admin' && attachment.uploaded_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own attachments' });
    }

    await pool.query('DELETE FROM attachments WHERE id = $1', [req.params.attachmentId]);
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
    const result = await pool.query(
      'INSERT INTO comments (defect_id, user_id, message) VALUES ($1, $2, $3) RETURNING *',
      [req.params.id, req.user.id, message]
    );
    const comment = result.rows[0];
    const withUser = await pool.query(
      'SELECT c.*, u.name as user_name, u.role as user_role FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = $1',
      [comment.id]
    );
    res.status(201).json(withUser.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
