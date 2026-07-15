// middleware/errorHandler.js
const logger   = require('../config/logger');
const AppError = require('../utils/AppError');

const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;

  // Log detallado solo en desarrollo o para errores 500
  if (process.env.NODE_ENV !== 'production' || err.statusCode >= 500) {
    logger.error(`${err.statusCode} — ${err.message}`, { stack: err.stack, path: req.path });
  }

  // Errores de JWT
  if (err.name === 'JsonWebTokenError')  return res.status(401).json({ ok: false, message: 'Token inválido' });
  if (err.name === 'TokenExpiredError')  return res.status(401).json({ ok: false, message: 'Token expirado' });
  // Errores de PG (constraint, duplicate)
  if (err.code === '23505') return res.status(409).json({ ok: false, message: 'Registro duplicado', detail: err.detail });
  if (err.code === '23503') return res.status(409).json({ ok: false, message: 'Referencia inválida' });

  res.status(err.statusCode).json({
    ok:      false,
    message: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

const notFound = (req, res) => {
  res.status(404).json({ ok: false, message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
};

module.exports = { globalErrorHandler, notFound };
