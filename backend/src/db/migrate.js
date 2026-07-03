require('dotenv').config();
const pool = require('./pool');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('qa', 'developer', 'pm', 'admin')),
        team VARCHAR(20) CHECK (team IN ('dev', 'fmw', 'mobility')),
        email VARCHAR(100),
        slack_user_id VARCHAR(50),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS modules (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS defects (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        project_id INTEGER REFERENCES projects(id),
        module_id INTEGER REFERENCES modules(id),
        environment VARCHAR(10) CHECK (environment IN ('SIT', 'UAT', 'PROD')),
        severity VARCHAR(20) CHECK (severity IN ('Sev1', 'Sev2', 'Sev3', 'Observation')),
        steps_to_reproduce TEXT,
        status VARCHAR(25) DEFAULT 'Open' CHECK (status IN ('Open', 'Need Clarification', 'Retest', 'Reopen', 'Closed')),
        assigned_team VARCHAR(20) CHECK (assigned_team IN ('dev', 'fmw', 'mobility')),
        assigned_to_user_id INTEGER REFERENCES users(id),
        clarification_assigned_to INTEGER REFERENCES users(id),
        raised_by_user_id INTEGER REFERENCES users(id),
        edited_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS attachments (
        id SERIAL PRIMARY KEY,
        defect_id INTEGER REFERENCES defects(id) ON DELETE CASCADE,
        file_path VARCHAR(500) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        uploaded_by INTEGER REFERENCES users(id),
        uploaded_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        defect_id INTEGER REFERENCES defects(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        defect_id INTEGER REFERENCES defects(id) ON DELETE CASCADE,
        changed_by_user_id INTEGER REFERENCES users(id),
        old_status VARCHAR(25),
        new_status VARCHAR(25),
        note TEXT,
        changed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Add new columns to existing defects table if they don't exist
    await client.query(`ALTER TABLE defects ADD COLUMN IF NOT EXISTS clarification_assigned_to INTEGER REFERENCES users(id)`);
    await client.query(`ALTER TABLE defects ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ`);

    // Migrate old statuses to new ones
    await client.query(`UPDATE defects SET status = 'Open' WHERE status IN ('Assigned', 'In Progress', 'Fixed')`);

    // Relax constraint to allow new statuses (drop old check, add new one)
    await client.query(`ALTER TABLE defects DROP CONSTRAINT IF EXISTS defects_status_check`);
    await client.query(`ALTER TABLE defects ADD CONSTRAINT defects_status_check CHECK (status IN ('Open', 'Need Clarification', 'Retest', 'Reopen', 'Closed'))`);

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

migrate().catch(process.exit.bind(process, 1));
