// controllers/aiController.js
const { validationResult } = require('express-validator');
const { v4: uuid } = require('uuid');
const aiService = require('../services/aiService');
const db        = require('../config/database');
const AppError  = require('../utils/AppError');

exports.chat = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ ok: false, errors: errors.array() });

  const { mensaje } = req.body;
  const sessionId = req.body.sessionId || uuid();

  const result = await aiService.chatAsistente({
    userId: req.user.id, mensaje, sessionId
  });

  res.json({ ok: true, data: result });
};

exports.recordatorio = async (req, res) => {
  const msg = await aiService.generarRecordatorio({
    citaId: req.params.citaId,
    usuario_id: req.user.id,
  });
  res.json({ ok: true, data: { mensaje: msg } });
};

exports.resumenSesion = async (req, res) => {
  const resumen = await aiService.generarResumenSesion({
    citaId: req.params.citaId,
    usuario_id: req.user.id,
  });
  if (!resumen) throw new AppError('No hay notas para esta cita', 404);
  res.json({ ok: true, data: { resumen } });
};

exports.bienestar = async (req, res) => {
  const analisis = await aiService.analizarBienestar({
    pacienteId: req.params.pacienteId,
    usuario_id: req.user.id,
  });
  if (!analisis) throw new AppError('Sin suficientes notas para análisis', 404);
  res.json({ ok: true, data: { analisis } });
};

exports.clasificar = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ ok: false, errors: errors.array() });
  const categoria = await aiService.clasificarMotivo({
    motivo: req.body.motivo,
    usuario_id: req.user.id,
  });
  res.json({ ok: true, data: { categoria: categoria.trim() } });
};

exports.log = async (req, res) => {
  const { page = 1, limit = 50, proveedor } = req.query;
  const offset = (page - 1) * limit;
  const params = [];
  let where = '';
  if (proveedor) { params.push(proveedor); where = `WHERE proveedor=$1`; }
  params.push(limit, offset);
  const { rows } = await db.query(`
    SELECT i.*, u.nombre || ' ' || u.apellido AS usuario
    FROM ai.interacciones i
    LEFT JOIN app.usuarios u ON u.id = i.usuario_id
    ${where}
    ORDER BY i.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params);
  res.json({ ok: true, data: rows, page: +page, limit: +limit });
};

exports.costos = async (req, res) => {
  const { rows } = await db.query(`
    SELECT
      proveedor,
      DATE_TRUNC('month', created_at) AS mes,
      COUNT(*)                         AS total_llamadas,
      SUM(tokens_entrada)              AS tokens_entrada,
      SUM(tokens_salida)               AS tokens_salida,
      SUM(costo_usd)                   AS costo_usd_total,
      AVG(latencia_ms)                 AS latencia_promedio_ms
    FROM ai.interacciones
    GROUP BY proveedor, DATE_TRUNC('month', created_at)
    ORDER BY mes DESC, proveedor
  `);
  res.json({ ok: true, data: rows });
};

exports.listarPlantillas = async (req, res) => {
  const { rows } = await db.query('SELECT * FROM ai.plantillas_prompt ORDER BY nombre');
  res.json({ ok: true, data: rows });
};

exports.crearPlantilla = async (req, res) => {
  const { nombre, descripcion, proveedor, modelo, sistema, plantilla, variables } = req.body;
  const { rows } = await db.query(`
    INSERT INTO ai.plantillas_prompt (nombre, descripcion, proveedor, modelo, sistema, plantilla, variables)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
  `, [nombre, descripcion, proveedor, modelo, sistema, plantilla, variables]);
  res.status(201).json({ ok: true, data: rows[0] });
};

exports.actualizarPlantilla = async (req, res) => {
  const { id } = req.params;
  const { sistema, plantilla, activa, variables } = req.body;
  const { rows } = await db.query(`
    UPDATE ai.plantillas_prompt SET sistema=$1, plantilla=$2, activa=$3, variables=$4, version=version+1
    WHERE id=$5 RETURNING *
  `, [sistema, plantilla, activa, variables, id]);
  if (!rows.length) throw new AppError('Plantilla no encontrada', 404);

  const redis = require('../config/redis');
  await redis.del(`prompt:plantilla:${rows[0].nombre}`);

  res.json({ ok: true, data: rows[0] });
};
