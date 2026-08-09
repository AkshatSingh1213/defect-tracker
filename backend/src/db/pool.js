const oracledb = require('oracledb');
require('dotenv').config();

// ─── Thick mode ───────────────────────────────────────────────────────────────
// The target Oracle DB runs a version older than what oracledb Thin mode
// supports (Thin requires Oracle ≥ 12.1).  Thick mode via Oracle Instant
// Client works with Oracle 11g and later.
//
// initOracleClient() must be called once, before any pool or connection is
// created.  ORACLE_CLIENT_LIB_DIR must be set in .env (it is machine-specific).
oracledb.initOracleClient({ libDir: process.env.ORACLE_CLIENT_LIB_DIR });

// Return CLOB columns as plain JS strings instead of Lob stream objects.
// Without this, oracledb yields a Lob stream which cannot be JSON-serialised
// and must be manually drained before the connection can be released.
oracledb.fetchAsString = [oracledb.CLOB];

let _pool = null;

const getPool = async () => {
  if (_pool) return _pool;
  _pool = await oracledb.createPool({
    user:          process.env.ORACLE_USER,
    password:      process.env.ORACLE_PASSWORD,
    connectString: `${process.env.ORACLE_HOST}:${process.env.ORACLE_PORT}/${process.env.ORACLE_SERVICE_NAME}`,
    poolMin:       2,
    poolMax:       10,
    poolIncrement: 1,
  });
  return _pool;
};

/**
 * Oracle returns column names in uppercase.  Normalise to lowercase so the
 * rest of the codebase can use lowercase property names (matches pg behaviour).
 */
const normalizeRows = (rows) => {
  if (!rows) return [];
  return rows.map(row => {
    const out = {};
    for (const key of Object.keys(row)) out[key.toLowerCase()] = row[key];
    return out;
  });
};

const execStatement = async (conn, sql, params, autoCommit) => {
  const result = await conn.execute(sql, params || [], {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    autoCommit,
  });
  return { rows: normalizeRows(result.rows) };
};

/** Execute a single auto-committed statement. Returns { rows: [] }. */
const query = async (sql, params) => {
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    return await execStatement(conn, sql, params, true);
  } finally {
    await conn.close();
  }
};

/**
 * Obtain a transactional connection with pg-style keyword handling:
 *   client.query('BEGIN')    → no-op (Oracle auto-starts on first DML)
 *   client.query('COMMIT')   → conn.commit()
 *   client.query('ROLLBACK') → conn.rollback()
 *   client.release()         → conn.close()
 */
const connect = async () => {
  const p = await getPool();
  const conn = await p.getConnection();

  const clientQuery = async (sql, params) => {
    const upper = sql.trim().toUpperCase();
    if (upper === 'BEGIN')    return { rows: [] };
    if (upper === 'COMMIT')   { await conn.commit();   return { rows: [] }; }
    if (upper === 'ROLLBACK') { await conn.rollback(); return { rows: [] }; }
    return execStatement(conn, sql, params, false);
  };

  return { query: clientQuery, release: () => conn.close() };
};

const end = async () => {
  if (_pool) { await _pool.close(0); _pool = null; }
};

module.exports = { query, connect, end };
