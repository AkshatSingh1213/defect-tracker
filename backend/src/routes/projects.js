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
    const count = await pool.query('SELECT COUNT(*) FROM projects');
    if (parseInt(count.rows[0].count) >= 4) {
      return res.status(400).json({ error: 'Maximum 4 projects allowed' });
    }
    const result = await pool.query('INSERT INTO projects (name) VALUES ($1) RETURNING *', [name]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/projects/:id/modules
router.get('/:id/modules', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM modules WHERE project_id = $1 ORDER BY name ASC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/projects/:id/modules — admin only
router.post('/:id/modules', authenticateToken, requireRole('admin'), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Module name required' });
  try {
    const result = await pool.query(
      'INSERT INTO modules (project_id, name) VALUES ($1, $2) RETURNING *',
      [req.params.id, name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
