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
    let query = 'SELECT id, name, username, role, team, email, slack_user_id, is_active, created_at FROM users';
    const params = [];
    if (role) {
      query += ' WHERE role = $1 AND is_active = TRUE ORDER BY name ASC';
      params.push(role);
    } else {
      query += ' ORDER BY created_at DESC';
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/users/team/:team — get developers by team
router.get('/team/:team', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, username FROM users WHERE team = $1 AND role = $2 AND is_active = TRUE',
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
    const result = await pool.query(
      `INSERT INTO users (name, username, password_hash, role, team, email, slack_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, username, role, team, email, is_active, created_at`,
      [name, username, passwordHash, role, team || null, email || null, slack_user_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/users/:id — admin updates user (deactivate, update fields, optional password)
router.patch('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  const { name, email, slack_user_id, is_active, team, role, password } = req.body;
  try {
    // If password provided, hash and update it too
    if (password && password.trim()) {
      const passwordHash = await bcrypt.hash(password, 12);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.params.id]);
    }

    const result = await pool.query(
      `UPDATE users SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        slack_user_id = COALESCE($3, slack_user_id),
        is_active = COALESCE($4, is_active),
        team = COALESCE($5, team),
        role = COALESCE($6, role)
       WHERE id = $7
       RETURNING id, name, username, role, team, email, is_active, slack_user_id`,
      [name || null, email || null, slack_user_id || null, is_active !== undefined ? is_active : null, team || null, role || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/users/:id/password — admin resets password
router.put('/:id/password', authenticateToken, requireRole('admin'), async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.params.id]);
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
