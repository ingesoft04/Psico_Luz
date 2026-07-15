// ════════════════════════════════════════════════════════════
//  config/redis.js — Cliente Redis con ioredis
// ════════════════════════════════════════════════════════════

const Redis  = require('ioredis');
const logger = require('./logger');

const redisClient = new Redis({
  host:     process.env.REDIS_HOST     || 'localhost',
  port:     parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
  db: 0,
  retryStrategy: (times) => {
    if (times > 10) return null;  // dejar de reintentar
    return Math.min(times * 200, 3000);
  },
  lazyConnect: true,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
});

redisClient.on('connect',    () => logger.info('Redis: conectando...'));
redisClient.on('ready',      () => logger.info('Redis: listo'));
redisClient.on('error',  (e) => logger.error('Redis error:', e));
redisClient.on('reconnecting', () => logger.warn('Redis: reconectando...'));

// ─── Helpers de cache ─────────────────────────────────────

const TTL = {
  DEFAULT:  parseInt(process.env.REDIS_TTL_DEFAULT)  || 3600,
  SESSION:  parseInt(process.env.REDIS_TTL_SESSION)  || 604800,
  CACHE:    parseInt(process.env.REDIS_TTL_CACHE)    || 1800,
};

/** Lee del cache o ejecuta fn() y guarda el resultado */
async function cacheOr(key, fn, ttl = TTL.CACHE) {
  const cached = await redisClient.get(key);
  if (cached) return JSON.parse(cached);
  const data = await fn();
  if (data !== null && data !== undefined) {
    await redisClient.setex(key, ttl, JSON.stringify(data));
  }
  return data;
}

/** Invalida claves por patrón (ej: "citas:*") */
async function invalidate(pattern) {
  const keys = await redisClient.keys(pattern);
  if (keys.length > 0) await redisClient.del(...keys);
}

module.exports = Object.assign(redisClient, { cacheOr, invalidate, TTL });
