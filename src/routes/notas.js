const router = require('express').Router();
const db = require('../config/database');
const { auth, rol } = require('../middleware/auth');
const AppError = require('../utils/AppError');
const integrity = require('../services/clinicalDocumentIntegrity');
const pdfService = require('../services/clinicalPdfService');
const emailService = require('../services/clinicalEmailService');

router.use(auth, rol('psicologa'));

const fullDocument = async noteId => {
  const { rows } = await db.query(`SELECT n.*,c.fecha,c.hora_inicio,c.hora_fin,c.modalidad,
    p.nombre paciente_nombre,p.apellido paciente_apellido,p.email paciente_email,
    pr.nombre profesional_nombre,pr.apellido profesional_apellido,pr.email profesional_email
    FROM app.notas_sesion n JOIN app.citas c ON c.id=n.cita_id
    JOIN app.usuarios p ON p.id=n.paciente_id JOIN app.usuarios pr ON pr.id=n.profesional_id
    WHERE n.id=$1`, [noteId]);
  if (!rows.length) throw new AppError('Nota no encontrada', 404);
  return rows[0];
};

router.get('/cita/:citaId/contexto', async (req, res) => {
  const { rows } = await db.query(`SELECT c.id,c.fecha,c.hora_inicio,c.hora_fin,c.modalidad,
    p.id paciente_id,p.nombre paciente_nombre,p.apellido paciente_apellido,p.email paciente_email,
    n.id nota_id,n.contenido,n.estado_animo,n.progreso,n.tareas_asignadas,n.next_steps,
    n.firmado_at,n.protegido_at,n.enviado_at,n.enviado_a,n.contenido_hash,n.clasificacion
    FROM app.citas c JOIN app.usuarios p ON p.id=c.paciente_id
    LEFT JOIN LATERAL (SELECT * FROM app.notas_sesion WHERE cita_id=c.id ORDER BY created_at DESC LIMIT 1) n ON true
    WHERE c.id=$1`, [req.params.citaId]);
  if (!rows.length) throw new AppError('Cita no encontrada', 404);
  res.json({ ok: true, data: rows[0] });
});

router.get('/:citaId', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM app.notas_sesion WHERE cita_id=$1 ORDER BY created_at DESC', [req.params.citaId]);
  res.json({ ok: true, data: rows });
});

router.post('/:citaId', async (req, res) => {
  const { contenido, estado_animo, progreso, tareas_asignadas, next_steps } = req.body;
  if (!contenido?.trim()) throw new AppError('El registro de atención es requerido', 400);
  const { rows: appointments } = await db.query('SELECT paciente_id FROM app.citas WHERE id=$1', [req.params.citaId]);
  if (!appointments.length) throw new AppError('Cita no encontrada', 404);
  const existing = await db.query('SELECT id FROM app.notas_sesion WHERE cita_id=$1 ORDER BY created_at DESC LIMIT 1', [req.params.citaId]);
  if (existing.rowCount) throw new AppError('La cita ya tiene un registro; edite el borrador existente', 409);
  const { rows } = await db.query(`INSERT INTO app.notas_sesion
    (cita_id,paciente_id,profesional_id,contenido,estado_animo,progreso,tareas_asignadas,next_steps,es_privada)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING *`,
  [req.params.citaId, appointments[0].paciente_id, req.user.id, contenido, estado_animo || null, progreso || null, tareas_asignadas || null, next_steps || null]);
  res.status(201).json({ ok: true, data: rows[0] });
});

router.put('/documento/:notaId', async (req, res) => {
  const current = await db.query('SELECT * FROM app.notas_sesion WHERE id=$1', [req.params.notaId]);
  if (!current.rowCount) throw new AppError('Nota no encontrada', 404);
  if (current.rows[0].firmado_at) throw new AppError('Una nota firmada es inmutable', 409);
  if (current.rows[0].profesional_id !== req.user.id) throw new AppError('Solo la profesional autora puede editar', 403);
  const { contenido, estado_animo, progreso, tareas_asignadas, next_steps } = req.body;
  if (!contenido?.trim()) throw new AppError('El registro de atención es requerido', 400);
  const { rows } = await db.query(`UPDATE app.notas_sesion SET contenido=$1,estado_animo=$2,progreso=$3,
    tareas_asignadas=$4,next_steps=$5 WHERE id=$6 RETURNING *`,
  [contenido, estado_animo || null, progreso || null, tareas_asignadas || null, next_steps || null, req.params.notaId]);
  res.json({ ok: true, data: rows[0] });
});

router.post('/documento/:notaId/firmar', async (req, res) => {
  const note = await fullDocument(req.params.notaId);
  if (note.profesional_id !== req.user.id) throw new AppError('Solo la profesional autora puede firmar', 403);
  if (note.firmado_at) return res.json({ ok: true, data: note });
  const digest = integrity.hash(note);
  const { rows } = await db.query(`UPDATE app.notas_sesion SET contenido_hash=$1,firma_hmac=$2,firmado_at=NOW()
    WHERE id=$3 RETURNING id,contenido_hash,firma_hmac,firmado_at`, [digest, integrity.sign(digest), note.id]);
  res.json({ ok: true, data: rows[0] });
});

router.post('/documento/:notaId/proteger', async (req, res) => {
  const note = await fullDocument(req.params.notaId);
  if (!note.firmado_at) throw new AppError('Debe firmar el documento antes de protegerlo', 409);
  if (!integrity.verify(note)) throw new AppError('La integridad del documento no es válida', 409);
  const { rows } = await db.query(`UPDATE app.notas_sesion SET protegido_at=COALESCE(protegido_at,NOW()),
    protegido_por=COALESCE(protegido_por,$1) WHERE id=$2 RETURNING id,protegido_at,clasificacion`,
  [req.user.id, note.id]);
  res.json({ ok: true, data: rows[0] });
});

router.get('/documento/:notaId/verificar', async (req, res) => {
  const note = await fullDocument(req.params.notaId);
  res.json({ ok: true, data: { valida: integrity.verify(note), hash: integrity.hash(note), firmado_at: note.firmado_at, protegido_at: note.protegido_at, clasificacion: note.clasificacion } });
});

router.get('/documento/:notaId/pdf', async (req, res) => {
  const note = await fullDocument(req.params.notaId);
  if (!note.protegido_at) throw new AppError('Proteja el documento antes de exportarlo', 409);
  if (!integrity.verify(note)) throw new AppError('La integridad del documento no es válida', 409);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="informe-clinico-${note.id.slice(0, 8)}.pdf"`, 'Cache-Control': 'no-store', 'X-Content-Classification': 'CONFIDENCIAL' });
  const doc = pdfService.create(note);
  doc.pipe(res);
  doc.end();
});

router.post('/documento/:notaId/enviar', async (req, res) => {
  const note = await fullDocument(req.params.notaId);
  if (!note.protegido_at || !integrity.verify(note)) throw new AppError('Solo puede enviar un documento firmado y protegido', 409);
  const to = String(req.body.email || note.paciente_email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new AppError('Correo de destino inválido', 400);
  const filename = `informe-clinico-${note.id.slice(0, 8)}.pdf`;
  await emailService.send({ to, patientName: `${note.paciente_nombre} ${note.paciente_apellido}`, pdf: await pdfService.toBuffer(note), filename });
  await db.query('UPDATE app.notas_sesion SET enviado_at=NOW(),enviado_a=$1 WHERE id=$2', [to, note.id]);
  res.json({ ok: true, message: `Documento enviado a ${to}` });
});

module.exports = router;
