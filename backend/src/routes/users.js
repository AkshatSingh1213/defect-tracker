const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { authenticateToken, requireRole } = require('../middleware/auth');

// GET /api/users — admin only, supports ?role= filter for all authenticated users
router.get('/', authenticateToken, async (req, res) => {
  const { role } = req.query;
  try {
    // Non-admins can only query by role (used for clarification dropdown)
    if (req.user.role !== 'admin' && !role) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    let result;
    if (role) {
      result = await pool.query(
        'SELECT id, name, username, role, team, email, slack_user_id, is_active, created_at FROM users WHERE role = :1 AND is_active = 1 ORDER BY name ASC',
        [role]
      );
    } else {
      result = await pool.query(
        'SELECT id, name, username, role, team, email, slack_user_id, is_active, created_at FROM users ORDER BY created_at DESC'
      );
    }
    // Normalize is_active: Oracle stores as 1/0, return true/false for frontend
    const rows = result.rows.map(u => ({ ...u, is_active: u.is_active === 1 || u.is_active === true }));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/users/team/:team — get developers by team
router.get('/team/:team', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, username FROM users WHERE team = :1 AND role = :2 AND is_active = 1',
      [req.params.team, 'developer']
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/users — admin creates user
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  const { name, username, password, role, team, email, slack_user_id } = req.body;
  if (!name || !username || !password || !role) {
    return res.status(400).json({ error: 'name, username, password, role are required' });
  }
  if (!['qa', 'developer', 'pm', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  if (role === 'developer' && !team) {
    return res.status(400).json({ error: 'Team is required for developers' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    // Check for duplicate username
    const dup = await pool.query('SELECT id FROM users WHERE username = :1', [username]);
    if (dup.rows.length > 0) return res.status(409).json({ error: 'Username already exists' });

    await pool.query(
      `INSERT INTO users (name, username, password_hash, role, team, email, slack_user_id)
       VALUES (:1, :2, :3, :4, :5, :6, :7)`,
      [name, username, passwordHash, role, team || null, email || null, slack_user_id || null]
    );
    const created = await pool.query(
      'SELECT id, name, username, role, team, email, is_active, created_at FROM users WHERE username = :1',
      [username]
    );
    const user = { ...created.rows[0], is_active: created.rows[0].is_active === 1 };
    res.status(201).json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/users/:id — admin updates user (deactivate, update fields, optional password)
router.patch('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  const { name, email, slack_user_id, is_active, team, role, password } = req.body;
  try {
    if (password && password.trim()) {
      const passwordHash = await bcrypt.hash(password, 12);
      await pool.query('UPDATE users SET password_hash = :1 WHERE id = :2', [passwordHash, req.params.id]);
    }

    // Build dynamic UPDATE — only set fields that were provided
    const updates = [];
    const params = [];
    let idx = 1;
    if (name !== undefined)          { updates.push(`name = :${idx++}`);           params.push(name); }
    if (email !== undefined)         { updates.push(`email = :${idx++}`);          params.push(email || null); }
    if (slack_user_id !== undefined) { updates.push(`slack_user_id = :${idx++}`);  params.push(slack_user_id || null); }
    if (is_active !== undefined)     { updates.push(`is_active = :${idx++}`);      params.push(is_active ? 1 : 0); }
    if (team !== undefined)          { updates.push(`team = :${idx++}`);           params.push(team || null); }
    if (role !== undefined)          { updates.push(`role = :${idx++}`);           params.push(role); }

    if (updates.length > 0) {
      params.push(req.params.id);
      await pool.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = :${idx}`,
        params
      );
    }

    const result = await pool.query(
      'SELECT id, name, username, role, team, email, is_active, slack_user_id FROM users WHERE id = :1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = { ...result.rows[0], is_active: result.rows[0].is_active === 1 };
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/users/:id/password — admin resets password
router.put('/:id/password', authenticateToken, requireRole('admin'), async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query('UPDATE users SET password_hash = :1 WHERE id = :2', [passwordHash, req.params.id]);
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
