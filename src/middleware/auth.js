// ════════════════════════════════════════════════════════════
//  middleware/auth.js — JWT Authentication
// ════════════════════════════════════════════════════════════
const jwt    = require('jsonwebtoken');
const redis  = require('../config/redis');
const db     = require('../config/database');

const AppError = require('../utils/AppError');

const auth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AppError('Token requerido', 401);

  const token = header.split(' ')[1];

  // ¿Está en blacklist (logout)?
  const blacklisted = await redis.get(`blacklist:${token}`);
  if (blacklisted) throw new AppError('Token revocado', 401);

  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  // Buscar usuario en cache primero
  let usuario = JSON.parse(await redis.get(`user:${decoded.id}`) || 'null');
  if (!usuario) {
    const { rows } = await db.query(
      'SELECT id, nombre, apellido, email, rol, activo FROM app.usuarios WHERE id=$1',
      [decoded.id]
    );
    usuario = rows[0];
    if (usuario) await redis.setex(`user:${decoded.id}`, redis.TTL.CACHE, JSON.stringify(usuario));
  }

  if (!usuario)         throw new AppError('Usuario no encontrado', 401);
  if (!usuario.activo)  throw new AppError('Cuenta desactivada', 401);

  req.user = usuario;
  next();
};

// Verificar roles
const rol = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.rol))
    throw new AppError(`Acceso denegado. Rol requerido: ${roles.join(' o ')}`, 403);
  next();
};

module.exports = { auth, rol };


// ════════════════════════════════════════════════════════════
//  middleware/errorHandler.js
// ════════════════════════════════════════════════════════════

// (Se exporta al final de este mismo archivo para simplificar)

// ════════════════════════════════════════════════════════════
//  middleware/rateLimiter.js — Rate limiting con Redis
// ════════════════════════════════════════════════════════════
