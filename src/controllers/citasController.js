// controllers/citasController.js
const { validationResult } = require('express-validator');
const db       = require('../config/database');
const redis    = require('../config/redis');
const AppError = require('../utils/AppError');
const { citaQueue } = require('../jobs/queues');
const { listCacheKey, addMinutes } = require('../utils/citas');
const automation = require('../services/appointmentAutomationService');

// ─── Helpers ──────────────────────────────────────────────

const CACHE_KEY = {
  lista:    (uid, rol) => `citas:lista:${rol}:${uid}`,
  detalle:  (id) => `citas:det:${id}`,
  hoy:      () => `citas:hoy:${new Date().toISOString().split('T')[0]}`,
};

// ─── LISTAR ───────────────────────────────────────────────

exports.listar = async (req, res) => {
  const { page = 1, limit = 20, estado, desde, hasta } = req.query;
  const offset = (page - 1) * limit;
  const user   = req.user;

  const cacheKey = listCacheKey(user, { page, limit, estado, desde, hasta });
  const cached   = await redis.get(cacheKey);
  if (cached) return res.json({ ok: true, cached: true, ...JSON.parse(cached) });

  // Pacientes solo ven sus propias citas
  const esAdmin = ['admin','psicologa','recepcionista'].includes(user.rol);
  const params  = esAdmin ? [] : [user.id];
  let where     = esAdmin ? 'WHERE 1=1' : 'WHERE c.paciente_id=$1';
  if (estado) { params.push(estado); where += ` AND c.estado=$${params.length}`; }
  if (desde)  { params.push(desde);  where += ` AND c.fecha>=$${params.length}`; }
  if (hasta)  { params.push(hasta);  where += ` AND c.fecha<=$${params.length}`; }

  params.push(limit, offset);
  const { rows } = await db.query(`
    SELECT c.id, c.fecha, c.hora_inicio, c.hora_fin, c.modalidad,
           c.tipo_sesion, c.estado, c.motivo, c.link_videollamada,
           u.nombre || ' ' || u.apellido AS paciente,
           u.telefono, u.whatsapp
    FROM app.citas c
    JOIN app.usuarios u ON u.id = c.paciente_id
    ${where}
    ORDER BY c.fecha DESC, c.hora_inicio DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params);

  const payload = { data: rows, page: +page, limit: +limit };
  await redis.setex(cacheKey, 300, JSON.stringify(payload));
  res.json({ ok: true, ...payload });
};

// ─── HOY ──────────────────────────────────────────────────

exports.hoy = async (req, res) => {
  const cacheKey = CACHE_KEY.hoy();
  const data = await redis.cacheOr(cacheKey, async () => {
    const { rows } = await db.query('SELECT * FROM app.v_citas_hoy');
    return rows;
  }, 120); // cache 2 min
  res.json({ ok: true, data });
};

// ─── OBTENER UNA ──────────────────────────────────────────

exports.obtener = async (req, res) => {
  const { id } = req.params;
  const data = await redis.cacheOr(CACHE_KEY.detalle(id), async () => {
    const { rows } = await db.query(`
      SELECT c.*, u.nombre, u.apellido, u.email, u.telefono, u.whatsapp
      FROM app.citas c
      JOIN app.usuarios u ON u.id = c.paciente_id
      WHERE c.id = $1
    `, [id]);
    return rows[0] || null;
  });
  if (!data) throw new AppError('Cita no encontrada', 404);

  // Paciente solo puede ver su propia cita
  if (req.user.rol === 'paciente' && data.paciente_id !== req.user.id)
    throw new AppError('Sin permiso', 403);

  res.json({ ok: true, data });
};

// ─── CREAR ────────────────────────────────────────────────

exports.crear = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ ok: false, errors: errors.array() });

  const { fecha, hora_inicio, hora_fin, modalidad, tipo_sesion, motivo, notas_previas, link_videollamada, consentimiento } = req.body;
  const paciente_id = req.user.rol === 'paciente' ? req.user.id : req.body.paciente_id;
  if (!paciente_id) throw new AppError('paciente_id requerido', 400);

  const client = await db.connect();
  let cita;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${fecha}:${hora_inicio}:${modalidad}`]);
    const { rows: conflict } = await client.query(
      `SELECT id FROM app.citas WHERE fecha=$1 AND hora_inicio=$2 AND modalidad=$3
       AND estado NOT IN ('cancelada','no_asistio')`, [fecha, hora_inicio, modalidad]
    );
    if (conflict.length) throw new AppError('Ese horario acaba de ser reservado. Elige otro.', 409);
    const end = hora_fin || addMinutes(hora_inicio);
    const { rows } = await client.query(`
      INSERT INTO app.citas
        (paciente_id, fecha, hora_inicio, hora_fin, modalidad, tipo_sesion, motivo, notas_previas, link_videollamada, created_by, consentimiento_aceptado_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CASE WHEN $11::boolean THEN NOW() ELSE NULL END) RETURNING *
    `, [paciente_id, fecha, hora_inicio, end, modalidad, tipo_sesion || 'individual', motivo, notas_previas, link_videollamada, req.user.id, consentimiento === true]);
    cita = rows[0];
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  // Invalidar caches
  await redis.invalidate(`citas:lista:*`);
  await redis.del(`slots:${fecha}:${modalidad}`);
  await redis.del(CACHE_KEY.hoy());

  await automation.created(cita.id);

  res.status(201).json({ ok: true, message: '¡Cita agendada exitosamente!', data: cita });
};

// ─── ACTUALIZAR ───────────────────────────────────────────

exports.actualizar = async (req, res) => {
  const { id } = req.params;
  const { fecha, hora_inicio, hora_fin, modalidad, motivo, notas_previas, link_videollamada } = req.body;

  const { rows } = await db.query(`
    UPDATE app.citas SET
      fecha=$1, hora_inicio=$2, hora_fin=$3, modalidad=$4,
      motivo=$5, notas_previas=$6, link_videollamada=$7, updated_at=NOW()
    WHERE id=$8 AND estado NOT IN ('cancelada','completada')
    RETURNING *
  `, [fecha, hora_inicio, hora_fin, modalidad, motivo, notas_previas, link_videollamada, id]);

  if (!rows.length) throw new AppError('Cita no encontrada o no modificable', 404);

  await redis.del(CACHE_KEY.detalle(id));
  await redis.invalidate('citas:lista:*');

  res.json({ ok: true, message: 'Cita actualizada', data: rows[0] });
};

exports.reprogramar = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ ok:false, errors:errors.array() });
  const { id } = req.params;
  const { fecha, hora_inicio, modalidad, motivo } = req.body;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: current } = await client.query('SELECT * FROM app.citas WHERE id=$1 FOR UPDATE', [id]);
    if (!current.length) throw new AppError('Cita no encontrada', 404);
    const cita = current[0];
    if (req.user.rol === 'paciente' && cita.paciente_id !== req.user.id) throw new AppError('Sin permiso', 403);
    if (['cancelada','completada'].includes(cita.estado)) throw new AppError('La cita ya no puede reprogramarse', 409);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${fecha}:${hora_inicio}:${modalidad}`]);
    const { rows: conflict } = await client.query(`SELECT 1 FROM app.citas WHERE id<>$1 AND fecha=$2 AND hora_inicio=$3 AND modalidad=$4 AND estado NOT IN ('cancelada','no_asistio')`, [id, fecha, hora_inicio, modalidad]);
    if (conflict.length) throw new AppError('Ese horario acaba de ser reservado', 409);
    const end = addMinutes(hora_inicio);
    const { rows } = await client.query(`UPDATE app.citas SET fecha=$1,hora_inicio=$2,hora_fin=$3,modalidad=$4,motivo=COALESCE($5,motivo),estado='pendiente' WHERE id=$6 RETURNING *`, [fecha,hora_inicio,end,modalidad,motivo,id]);
    await client.query('COMMIT');
    await Promise.all([redis.del(`slots:${cita.fecha}:${cita.modalidad}`), redis.del(`slots:${fecha}:${modalidad}`), redis.del(CACHE_KEY.detalle(id)), redis.invalidate('citas:lista:*')]);
    await automation.rescheduled(id);
    res.json({ ok:true, message:'Cita reprogramada correctamente', data:rows[0] });
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
};

exports.exportarCalendario = async (req, res) => {
  const { rows } = await db.query(`SELECT c.*,u.nombre,u.apellido FROM app.citas c JOIN app.usuarios u ON u.id=c.paciente_id WHERE c.id=$1`, [req.params.id]);
  if (!rows.length) throw new AppError('Cita no encontrada',404);
  const c=rows[0];
  if(req.user.rol==='paciente' && c.paciente_id!==req.user.id) throw new AppError('Sin permiso',403);
  const stamp=v=>String(v).replace(/[-:]/g,'').replace('.000','');
  const start=stamp(`${String(c.fecha).slice(0,10)}T${String(c.hora_inicio).slice(0,8)}`);
  const end=stamp(`${String(c.fecha).slice(0,10)}T${String(c.hora_fin).slice(0,8)}`);
  const safe=v=>String(v||'').replace(/[\\;,]/g,m=>`\\${m}`).replace(/\n/g,'\\n');
  const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Psicologa Luz Adriana//Agenda//ES','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${c.id}@psicologaluz.co`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,`DTSTART;TZID=America/Bogota:${start}`,`DTEND;TZID=America/Bogota:${end}`,'SUMMARY:Sesión con Psicóloga Luz Adriana',`DESCRIPTION:${safe(`${c.modalidad}. ${c.motivo||'Espacio de acompañamiento psicológico'}`)}`,'STATUS:CONFIRMED','BEGIN:VALARM','TRIGGER:-PT24H','ACTION:DISPLAY','DESCRIPTION:Tu sesión es mañana','END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n');
  res.set({'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':`attachment; filename="cita-${c.id.slice(0,8)}.ics"`}).send(ics);
};

exports.obtenerSalaVirtual = async (req,res) => {
  const {rows}=await db.query('SELECT * FROM app.citas WHERE id=$1',[req.params.id]);
  if(!rows.length) throw new AppError('Cita no encontrada',404);
  const c=rows[0];
  if(req.user.rol==='paciente'&&c.paciente_id!==req.user.id) throw new AppError('Sin permiso',403);
  if(c.modalidad!=='virtual') throw new AppError('La cita no es virtual',409);
  const fecha = c.fecha instanceof Date ? c.fecha.toISOString().slice(0,10) : String(c.fecha).slice(0,10);
  const start=new Date(`${fecha}T${String(c.hora_inicio).slice(0,8)}-05:00`).getTime();
  if(!Number.isFinite(start)) throw new AppError('Fecha de sesión inválida',500);
  if(Date.now()<start-30*60*1000||Date.now()>start+120*60*1000) throw new AppError('La sala estará disponible 30 minutos antes de la sesión',403);
  const base=process.env.VIDEO_BASE_URL||'https://meet.jit.si';
  res.json({ok:true,data:{url:c.link_videollamada||`${base}/PsicoLuz-${c.sala_virtual_token}`,disponible_hasta:new Date(start+120*60*1000).toISOString()}});
};

// ─── CAMBIAR ESTADO ───────────────────────────────────────

exports.cambiarEstado = async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;
  const validos = ['pendiente','confirmada','en_curso','completada','cancelada','no_asistio'];
  if (!validos.includes(estado)) throw new AppError('Estado inválido', 400);

  const { rows } = await db.query(
    'UPDATE app.citas SET estado=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
    [estado, id]
  );
  if (!rows.length) throw new AppError('Cita no encontrada', 404);

  await redis.del(CACHE_KEY.detalle(id));
  await redis.invalidate('citas:lista:*');
  await redis.del(CACHE_KEY.hoy());

  // Si completada, encolar resumen automático con IA
  if (estado === 'completada') {
    const { aiQueue } = require('../jobs/queues');
    await aiQueue.add('resumen-sesion', { citaId: id });
  }

  res.json({ ok: true, data: rows[0] });
};

// ─── CANCELAR ─────────────────────────────────────────────

exports.cancelar = async (req, res) => {
  const { id } = req.params;
  const { motivo_cancelacion } = req.body;

  const { rows } = await db.query(`
    UPDATE app.citas SET
      estado='cancelada', cancelada_por=$1,
      motivo_cancelacion=$2, updated_at=NOW()
    WHERE id=$3 AND estado NOT IN ('cancelada','completada')
      AND ($4::boolean OR paciente_id=$1)
    RETURNING *
  `, [req.user.id, motivo_cancelacion, id, req.user.rol !== 'paciente']);

  if (!rows.length) throw new AppError('Cita no encontrada o no cancelable', 404);

  await redis.del(CACHE_KEY.detalle(id));
  await redis.invalidate('citas:lista:*');
  await redis.del(`slots:${rows[0].fecha}:${rows[0].modalidad}`);
  await automation.cancelled(id);

  res.json({ ok: true, message: 'Cita cancelada', data: rows[0] });
};
