// controllers/authController.js
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { validationResult } = require('express-validator');
const db       = require('../config/database');
const redis    = require('../config/redis');
const AppError = require('../utils/AppError');
const logger   = require('../config/logger');

const sign = (payload, secret, expiresIn) =>
  jwt.sign(payload, secret, { expiresIn });

const makeTokens = (user) => ({
  accessToken:  sign({ id: user.id, rol: user.rol }, process.env.JWT_SECRET, process.env.JWT_EXPIRES_IN || '7d'),
  refreshToken: sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, process.env.JWT_REFRESH_EXPIRES_IN || '30d'),
});

exports.register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ ok: false, errors: errors.array() });

  const { nombre, apellido, email, password, telefono, whatsapp, ciudad, genero, como_nos_conocio, tipo_documento, numero_documento, fecha_nacimiento } = req.body;

  const { rows: exists } = await db.query('SELECT id FROM app.usuarios WHERE email=$1', [email]);
  if (exists.length) throw new AppError('Este correo ya está registrado', 409);

  const hash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
  const tokenVerif = uuidv4();

  const { rows } = await db.query(`
    INSERT INTO app.usuarios
      (nombre, apellido, email, password_hash, telefono, whatsapp, ciudad, genero, como_nos_conocio, token_verificacion, tipo_documento, numero_documento, fecha_nacimiento)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING id, nombre, apellido, email, rol, activo, created_at
  `, [nombre, apellido, email, hash, telefono, whatsapp, ciudad, genero, como_nos_conocio, tokenVerif, tipo_documento || null, numero_documento || null, fecha_nacimiento || null]);

  const user = rows[0];
  const tokens = makeTokens(user);

  // Guardar refresh token en Redis
  await redis.setex(`refresh:${user.id}`, 30 * 24 * 3600, tokens.refreshToken);

  logger.info(`Nuevo registro: ${email}`);

  // TODO: enviar email de verificación con tokenVerif

  res.status(201).json({
    ok: true,
    message: '¡Cuenta creada! Revisa tu correo para verificarla.',
    data: { user, ...tokens }
  });
};

exports.login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ ok: false, errors: errors.array() });

  const { email, password } = req.body;

  const { rows } = await db.query(
    'SELECT * FROM app.usuarios WHERE email=$1 AND activo=true',
    [email]
  );
  if (!rows.length) throw new AppError('Credenciales incorrectas', 401);

  const user = rows[0];
  const ok   = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new AppError('Credenciales incorrectas', 401);

  // Actualizar último login
  await db.query('UPDATE app.usuarios SET ultimo_login=NOW() WHERE id=$1', [user.id]);

  const tokens = makeTokens(user);
  await redis.setex(`refresh:${user.id}`, 30 * 24 * 3600, tokens.refreshToken);

  // Cache del usuario
  const safe = { id: user.id, nombre: user.nombre, apellido: user.apellido, email: user.email, rol: user.rol, activo: user.activo };
  await redis.setex(`user:${user.id}`, redis.TTL.CACHE, JSON.stringify(safe));

  res.json({
    ok: true,
    message: `¡Bienvenido/a, ${user.nombre}!`,
    data: { user: safe, ...tokens }
  });
};

exports.refreshToken = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new AppError('Refresh token requerido', 401);

  const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  const stored  = await redis.get(`refresh:${decoded.id}`);
  if (stored !== refreshToken) throw new AppError('Refresh token inválido', 401);

  const { rows } = await db.query(
    'SELECT id, rol, activo FROM app.usuarios WHERE id=$1',
    [decoded.id]
  );
  if (!rows.length || !rows[0].activo) throw new AppError('Usuario no válido', 401);

  const tokens = makeTokens(rows[0]);
  await redis.setex(`refresh:${decoded.id}`, 30 * 24 * 3600, tokens.refreshToken);

  res.json({ ok: true, data: tokens });
};

exports.logout = async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    // Blacklist el access token hasta su expiración
    await redis.setex(`blacklist:${token}`, 7 * 24 * 3600, '1');
  }
  await redis.del(`refresh:${req.user.id}`);
  await redis.del(`user:${req.user.id}`);
  res.json({ ok: true, message: 'Sesión cerrada correctamente' });
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  const { rows } = await db.query('SELECT id FROM app.usuarios WHERE email=$1', [email]);
  if (!rows.length) return res.json({ ok: true, message: 'Si el correo existe, recibirás instrucciones.' });

  const token = uuidv4();
  const exp   = new Date(Date.now() + 3600 * 1000); // 1 hora
  await db.query(
    'UPDATE app.usuarios SET token_reset=$1, token_reset_exp=$2 WHERE id=$3',
    [token, exp, rows[0].id]
  );
  // TODO: enviar email con enlace de reset
  logger.info(`Reset password solicitado para: ${email}`);
  res.json({ ok: true, message: 'Si el correo existe, recibirás instrucciones.' });
};

exports.resetPassword = async (req, res) => {
  const { token, password } = req.body;
  const { rows } = await db.query(
    'SELECT id FROM app.usuarios WHERE token_reset=$1 AND token_reset_exp > NOW()',
    [token]
  );
  if (!rows.length) throw new AppError('Token inválido o expirado', 400);

  const hash = await bcrypt.hash(password, 12);
  await db.query(
    'UPDATE app.usuarios SET password_hash=$1, token_reset=NULL, token_reset_exp=NULL WHERE id=$2',
    [hash, rows[0].id]
  );
  // Invalidar sesiones activas
  await redis.del(`refresh:${rows[0].id}`);
  res.json({ ok: true, message: 'Contraseña actualizada correctamente' });
};

exports.verifyEmail = async (req, res) => {
  const { token } = req.params;
  const { rows } = await db.query(
    'UPDATE app.usuarios SET email_verificado=true, token_verificacion=NULL WHERE token_verificacion=$1 RETURNING id',
    [token]
  );
  if (!rows.length) throw new AppError('Token inválido', 400);
  res.json({ ok: true, message: '¡Email verificado correctamente!' });
};

exports.me = async (req, res) => {
  const { rows } = await db.query(`
    SELECT id, nombre, apellido, email, telefono, whatsapp, rol,
           ciudad, departamento, foto_url, fecha_nacimiento, genero, created_at
    FROM app.usuarios WHERE id=$1
  `, [req.user.id]);
  res.json({ ok: true, data: rows[0] });
};
