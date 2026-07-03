require('dotenv').config();
const pool = require('./pool');
const bcrypt = require('bcryptjs');

const seed = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Seed admin user
    const passwordHash = await bcrypt.hash('Admin@123', 12);
    await client.query(`
      INSERT INTO users (name, username, password_hash, role, email)
      VALUES ('Administrator', 'admin', $1, 'admin', 'admin@defecttracker.com')
      ON CONFLICT (username) DO NOTHING
    `, [passwordHash]);

    // Seed projects
    const project1 = await client.query(`
      INSERT INTO projects (name) VALUES ('Regression Defects')
      ON CONFLICT DO NOTHING RETURNING id
    `);
    const project2 = await client.query(`
      INSERT INTO projects (name) VALUES ('PR Defects')
      ON CONFLICT DO NOTHING RETURNING id
    `);

    // Get project IDs (handle if already inserted)
    const p1 = await client.query(`SELECT id FROM projects WHERE name='Regression Defects'`);
    const p2 = await client.query(`SELECT id FROM projects WHERE name='PR Defects'`);
    const pid1 = p1.rows[0]?.id;
    const pid2 = p2.rows[0]?.id;

    const sampleModules = ['Login', 'Dashboard', 'Reports', 'Lubes Indent', 'M&P Activity', 'Customer Profile'];

    for (const modName of sampleModules) {
      if (pid1) {
        await client.query(`
          INSERT INTO modules (project_id, name)
          SELECT $1::integer, $2::text WHERE NOT EXISTS (
            SELECT 1 FROM modules WHERE project_id=$1::integer AND name=$2::text
          )
        `, [pid1, modName]);
      }
      if (pid2) {
        await client.query(`
          INSERT INTO modules (project_id, name)
          SELECT $1::integer, $2::text WHERE NOT EXISTS (
            SELECT 1 FROM modules WHERE project_id=$1::integer AND name=$2::text
          )
        `, [pid2, modName]);
      }
    }

    await client.query('COMMIT');
    console.log('✅ Seed completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

seed().catch(process.exit.bind(process, 1));
