// ════════════════════════════════════════════════════════════
//  config/database.js — Pool de conexiones PostgreSQL
// ════════════════════════════════════════════════════════════

const { Pool } = require('pg');
const logger   = require('./logger');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.POSTGRES_DB,
  user:     process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  min:      parseInt(process.env.DB_POOL_MIN) || 2,
  max:      parseInt(process.env.DB_POOL_MAX) || 20,
  idleTimeoutMillis:    30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.NODE_ENV === 'production' && process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('error', (err) => {
  logger.error('PostgreSQL pool error:', err);
});

// Helper: query con log de duración
pool.queryLog = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const ms  = Date.now() - start;
  if (ms > 500) logger.warn(`Slow query (${ms}ms): ${text.substring(0, 100)}`);
  return res;
};

module.exports = pool;
