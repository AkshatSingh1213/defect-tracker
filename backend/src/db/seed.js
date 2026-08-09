require('dotenv').config();
const oracledb = require('oracledb');
oracledb.initOracleClient({ libDir: process.env.ORACLE_CLIENT_LIB_DIR });
const bcrypt = require('bcryptjs');

const seed = async () => {
  const conn = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: `${process.env.ORACLE_HOST}:${process.env.ORACLE_PORT}/${process.env.ORACLE_SERVICE_NAME}`,
  });

  try {
    // ── Admin user ─────────────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash('Admin@123', 12);

    // Check if admin already exists
    const existing = await conn.execute(
      `SELECT id FROM users WHERE username = 'admin'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (existing.rows.length === 0) {
      await conn.execute(
        `INSERT INTO users (name, username, password_hash, role, email)
         VALUES ('Administrator', 'admin', :1, 'admin', 'admin@defecttracker.com')`,
        [passwordHash],
        { autoCommit: true }
      );
      console.log('✅ Admin user created');
    } else {
      console.log('ℹ️  Admin user already exists, skipping');
    }

    // ── Projects ───────────────────────────────────────────────────────────────
    const projectNames = ['Regression Defects', 'PR Defects'];
    for (const projName of projectNames) {
      const exists = await conn.execute(
        `SELECT id FROM projects WHERE name = :1`,
        [projName],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (exists.rows.length === 0) {
        await conn.execute(
          `INSERT INTO projects (name) VALUES (:1)`,
          [projName],
          { autoCommit: true }
        );
        console.log(`✅ Project "${projName}" created`);
      } else {
        console.log(`ℹ️  Project "${projName}" already exists, skipping`);
      }
    }

    console.log('✅ Seed completed successfully');
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    throw err;
  } finally {
    await conn.close();
  }
};

seed().catch(err => { console.error(err); process.exit(1); });
