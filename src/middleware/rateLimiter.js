// middleware/rateLimiter.js
const rateLimit      = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redis          = require('../config/redis');

const makeStore = (prefix) => new RedisStore({
  sendCommand: (...args) => redis.call(...args),
  prefix,
});

const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:api:'),
  message: { ok: false, message: 'Demasiadas peticiones, intenta en unos minutos' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_AUTH_MAX) || 10,
  store: makeStore('rl:auth:'),
  message: { ok: false, message: 'Demasiados intentos de autenticación' },
  skipSuccessfulRequests: true,
});

module.exports = { apiLimiter, authLimiter };
