require('dotenv').config();
const oracledb = require('oracledb');
oracledb.initOracleClient({ libDir: process.env.ORACLE_CLIENT_LIB_DIR });

const migrate = async () => {
  const conn = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: `${process.env.ORACLE_HOST}:${process.env.ORACLE_PORT}/${process.env.ORACLE_SERVICE_NAME}`,
  });

  const exec = async (sql) => {
    try {
      await conn.execute(sql, [], { autoCommit: true });
    } catch (err) {
      // ORA-00942: table doesn't exist on DROP — ignore
      if (err.errorNum === 942 || err.errorNum === 2289 || err.errorNum === 4080) return;
      throw err;
    }
  };

  try {
    console.log('🔄 Dropping existing tables and sequences...');

    // Drop tables in reverse FK order
    await exec('DROP TABLE audit_log');
    await exec('DROP TABLE comments');
    await exec('DROP TABLE attachments');
    await exec('DROP TABLE defects');
    await exec('DROP TABLE projects');
    await exec('DROP TABLE users');

    // Drop sequences
    await exec('DROP SEQUENCE users_seq');
    await exec('DROP SEQUENCE projects_seq');
    await exec('DROP SEQUENCE defects_seq');
    await exec('DROP SEQUENCE attachments_seq');
    await exec('DROP SEQUENCE comments_seq');
    await exec('DROP SEQUENCE audit_log_seq');

    console.log('✅ Drop complete. Creating schema...');

    // ── USERS ──────────────────────────────────────────────────────────────────
    await exec('CREATE SEQUENCE users_seq START WITH 1 INCREMENT BY 1 NOCACHE');

    await exec(`
      CREATE TABLE users (
        id           NUMBER PRIMARY KEY,
        name         VARCHAR2(100) NOT NULL,
        username     VARCHAR2(50)  NOT NULL,
        password_hash VARCHAR2(255) NOT NULL,
        role         VARCHAR2(20)  NOT NULL CHECK (role IN ('qa', 'developer', 'pm', 'admin')),
        team         VARCHAR2(20)  CHECK (team IN ('dev', 'fmw', 'mobility')),
        email        VARCHAR2(100),
        slack_user_id VARCHAR2(50),
        is_active    NUMBER(1) DEFAULT 1 CHECK (is_active IN (0,1)),
        created_at   TIMESTAMP DEFAULT SYSTIMESTAMP,
        CONSTRAINT users_username_uq UNIQUE (username)
      )
    `);

    await exec(`
      CREATE OR REPLACE TRIGGER users_bir
        BEFORE INSERT ON users FOR EACH ROW
        WHEN (NEW.id IS NULL)
      BEGIN
        SELECT users_seq.NEXTVAL INTO :NEW.id FROM DUAL;
      END;
    `);

    // ── PROJECTS ───────────────────────────────────────────────────────────────
    await exec('CREATE SEQUENCE projects_seq START WITH 1 INCREMENT BY 1 NOCACHE');

    await exec(`
      CREATE TABLE projects (
        id         NUMBER PRIMARY KEY,
        name       VARCHAR2(100) NOT NULL,
        created_at TIMESTAMP DEFAULT SYSTIMESTAMP
      )
    `);

    await exec(`
      CREATE OR REPLACE TRIGGER projects_bir
        BEFORE INSERT ON projects FOR EACH ROW
        WHEN (NEW.id IS NULL)
      BEGIN
        SELECT projects_seq.NEXTVAL INTO :NEW.id FROM DUAL;
      END;
    `);

    // ── DEFECTS ────────────────────────────────────────────────────────────────
    await exec('CREATE SEQUENCE defects_seq START WITH 1 INCREMENT BY 1 NOCACHE');

    await exec(`
      CREATE TABLE defects (
        id                       NUMBER PRIMARY KEY,
        title                    VARCHAR2(255) NOT NULL,
        project_id               NUMBER REFERENCES projects(id),
        environment              VARCHAR2(10)  CHECK (environment IN ('SIT', 'UAT', 'PROD')),
        severity                 VARCHAR2(20)  CHECK (severity IN ('Sev1', 'Sev2', 'Sev3', 'Observation')),
        steps_to_reproduce       CLOB,
        status                   VARCHAR2(25)  DEFAULT 'Open'
                                   CHECK (status IN ('Open', 'Need Clarification', 'Retest', 'Reopen', 'Closed')),
        assigned_team            VARCHAR2(20)  CHECK (assigned_team IN ('dev', 'fmw', 'mobility')),
        assigned_to_user_id      NUMBER REFERENCES users(id),
        clarification_assigned_to NUMBER REFERENCES users(id),
        raised_by_user_id        NUMBER REFERENCES users(id),
        edited_at                TIMESTAMP,
        created_at               TIMESTAMP DEFAULT SYSTIMESTAMP,
        updated_at               TIMESTAMP DEFAULT SYSTIMESTAMP
      )
    `);

    await exec(`
      CREATE OR REPLACE TRIGGER defects_bir
        BEFORE INSERT ON defects FOR EACH ROW
        WHEN (NEW.id IS NULL)
      BEGIN
        SELECT defects_seq.NEXTVAL INTO :NEW.id FROM DUAL;
      END;
    `);

    // ── ATTACHMENTS ────────────────────────────────────────────────────────────
    await exec('CREATE SEQUENCE attachments_seq START WITH 1 INCREMENT BY 1 NOCACHE');

    await exec(`
      CREATE TABLE attachments (
        id          NUMBER PRIMARY KEY,
        defect_id   NUMBER REFERENCES defects(id) ON DELETE CASCADE,
        file_path   VARCHAR2(500) NOT NULL,
        file_name   VARCHAR2(255) NOT NULL,
        uploaded_by NUMBER REFERENCES users(id),
        uploaded_at TIMESTAMP DEFAULT SYSTIMESTAMP
      )
    `);

    await exec(`
      CREATE OR REPLACE TRIGGER attachments_bir
        BEFORE INSERT ON attachments FOR EACH ROW
        WHEN (NEW.id IS NULL)
      BEGIN
        SELECT attachments_seq.NEXTVAL INTO :NEW.id FROM DUAL;
      END;
    `);

    // ── COMMENTS ───────────────────────────────────────────────────────────────
    await exec('CREATE SEQUENCE comments_seq START WITH 1 INCREMENT BY 1 NOCACHE');

    await exec(`
      CREATE TABLE comments (
        id         NUMBER PRIMARY KEY,
        defect_id  NUMBER REFERENCES defects(id) ON DELETE CASCADE,
        user_id    NUMBER REFERENCES users(id),
        message    CLOB NOT NULL,
        created_at TIMESTAMP DEFAULT SYSTIMESTAMP
      )
    `);

    await exec(`
      CREATE OR REPLACE TRIGGER comments_bir
        BEFORE INSERT ON comments FOR EACH ROW
        WHEN (NEW.id IS NULL)
      BEGIN
        SELECT comments_seq.NEXTVAL INTO :NEW.id FROM DUAL;
      END;
    `);

    // ── AUDIT_LOG ──────────────────────────────────────────────────────────────
    await exec('CREATE SEQUENCE audit_log_seq START WITH 1 INCREMENT BY 1 NOCACHE');

    await exec(`
      CREATE TABLE audit_log (
        id                  NUMBER PRIMARY KEY,
        defect_id           NUMBER REFERENCES defects(id) ON DELETE CASCADE,
        changed_by_user_id  NUMBER REFERENCES users(id),
        old_status          VARCHAR2(25),
        new_status          VARCHAR2(25),
        note                VARCHAR2(1000),
        changed_at          TIMESTAMP DEFAULT SYSTIMESTAMP
      )
    `);

    await exec(`
      CREATE OR REPLACE TRIGGER audit_log_bir
        BEFORE INSERT ON audit_log FOR EACH ROW
        WHEN (NEW.id IS NULL)
      BEGIN
        SELECT audit_log_seq.NEXTVAL INTO :NEW.id FROM DUAL;
      END;
    `);

    console.log('✅ Migration completed successfully');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    await conn.close();
  }
};

migrate().catch(err => { console.error(err); process.exit(1); });
