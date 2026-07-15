const router = require('express').Router();
const db = require('../config/database');
const redis = require('../config/redis');
const AppError = require('../utils/AppError');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MODALIDADES = ['presencial', 'virtual'];

router.get('/', async (_req, res) => {
  const data = await redis.cacheOr('disponibilidad:semanal', async () => {
    const { rows } = await db.query(`
      SELECT id, dia_semana, hora_inicio, hora_fin, modalidad
      FROM app.disponibilidad WHERE activo = true
      ORDER BY dia_semana, hora_inicio, modalidad
    `);
    return rows;
  }, 900);
  res.json({ ok: true, data });
});

router.get('/slots', async (req, res) => {
  const { fecha, modalidad = 'virtual' } = req.query;
  if (!DATE_RE.test(fecha || '') || !MODALIDADES.includes(modalidad)) {
    throw new AppError('Fecha o modalidad inválida', 400);
  }

  const requested = new Date(`${fecha}T00:00:00-05:00`);
  if (Number.isNaN(requested.getTime())) throw new AppError('Fecha inválida', 400);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  if (fecha < today) throw new AppError('La fecha debe ser hoy o posterior', 400);

  const cacheKey = `slots:${fecha}:${modalidad}`;
  const data = await redis.cacheOr(cacheKey, async () => {
    const day = requested.getDay();
    const { rows: blocked } = await db.query('SELECT 1 FROM app.dias_bloqueados WHERE fecha=$1', [fecha]);
    if (blocked.length) return [];

    const [{ rows: ranges }, { rows: booked }] = await Promise.all([
      db.query(`SELECT hora_inicio, hora_fin FROM app.disponibilidad
                WHERE dia_semana=$1 AND modalidad=$2 AND activo=true`, [day, modalidad]),
      db.query(`SELECT hora_inicio FROM app.citas
                WHERE fecha=$1 AND modalidad=$2 AND estado NOT IN ('cancelada','no_asistio')`, [fecha, modalidad])
    ]);
    const occupied = new Set(booked.map(r => String(r.hora_inicio).slice(0, 5)));
    const slots = [];
    for (const range of ranges) {
      let [h, m] = String(range.hora_inicio).split(':').map(Number);
      const [eh, em] = String(range.hora_fin).split(':').map(Number);
      for (let minutes = h * 60 + m; minutes + 60 <= eh * 60 + em; minutes += 60) {
        const hora = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
        const startsAt = new Date(`${fecha}T${hora}:00-05:00`);
        if (!occupied.has(hora) && startsAt.getTime() > Date.now() + 30 * 60 * 1000) {
          slots.push({ hora, disponible: true });
        }
      }
    }
    return slots;
  }, 120);
  res.json({ ok: true, data, meta: { fecha, modalidad, zona_horaria: 'America/Bogota' } });
});

module.exports = router;
