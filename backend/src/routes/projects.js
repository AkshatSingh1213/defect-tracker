const router = require('express').Router();
const pool = require('../db/pool');
const { authenticateToken, requireRole } = require('../middleware/auth');

// GET /api/projects
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM projects ORDER BY created_at ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/projects — admin only, max 4
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name required' });
  try {
    const count = await pool.query('SELECT COUNT(*) AS cnt FROM projects');
    if (parseInt(count.rows[0].cnt) >= 4) {
      return res.status(400).json({ error: 'Maximum 4 projects allowed' });
    }
    await pool.query('INSERT INTO projects (name) VALUES (:1)', [name]);
    const created = await pool.query('SELECT * FROM projects WHERE name = :1', [name]);
    res.status(201).json(created.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
