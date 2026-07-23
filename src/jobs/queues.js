// ════════════════════════════════════════════════════════════
//  jobs/queues.js — Bull Queues con Redis
//  Procesa: recordatorios, IA, notificaciones, WhatsApp
// ════════════════════════════════════════════════════════════

const Bull   = require('bull');
const logger = require('../config/logger');

const redisOpts = {
  host:     process.env.REDIS_HOST     || 'redis',
  port:     parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
};

// ─── Instanciar colas ─────────────────────────────────────
const citaQueue  = new Bull('citas',         { redis: redisOpts, defaultJobOptions: { removeOnComplete: 50, removeOnFail: 100 } });
const aiQueue    = new Bull('ai-jobs',       { redis: redisOpts, defaultJobOptions: { removeOnComplete: 20 } });
const notifQueue = new Bull('notificaciones',{ redis: redisOpts, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 3000 } } });
const emailQueue = new Bull('emails',        { redis: redisOpts, defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 5000 } } });

// ════════════════════════════════════════════════════════════
//  PROCESADORES
// ════════════════════════════════════════════════════════════

async function initQueues() {

  citaQueue.process('calendar-sync', async job => {
    const db=require('../config/database');
    const calendar=require('../services/googleCalendarService');
    const {rows}=await db.query(`SELECT c.*,u.nombre paciente_nombre,u.apellido paciente_apellido,u.email
      FROM app.citas c JOIN app.usuarios u ON u.id=c.paciente_id WHERE c.id=$1`,[job.data.citaId]);
    if(!rows.length||rows[0].estado==='cancelada')return{skipped:true};
    const result=await calendar.sync(rows[0]);
    if(result.eventId)await db.query('UPDATE app.citas SET google_event_id=$1,google_event_url=$2 WHERE id=$3',[result.eventId,result.htmlLink,job.data.citaId]);
    return result;
  });

  citaQueue.process('calendar-cancel', async job => {
    const db=require('../config/database');
    const calendar=require('../services/googleCalendarService');
    const {rows}=await db.query('SELECT google_event_id FROM app.citas WHERE id=$1',[job.data.citaId]);
    return calendar.cancel(rows[0]?.google_event_id);
  });

  // ─── CITAS: Recordatorio automático ───────────────────

  citaQueue.process('recordatorio-cita', async (job) => {
    const { citaId } = job.data;
    const db  = require('../config/database');
    const aiS = require('../services/aiService');

    const { rows } = await db.query(`
      SELECT c.*, u.nombre, u.whatsapp, u.email
      FROM app.citas c
      JOIN app.usuarios u ON u.id = c.paciente_id
      WHERE c.id = $1 AND c.estado IN ('pendiente','confirmada')
        AND c.recordatorio_24h = false
    `, [citaId]);

    if (!rows.length) return { skipped: true };

    const cita = rows[0];

    // Generar mensaje personalizado con Claude
    const mensaje = await aiS.generarRecordatorio({ citaId, usuario_id: cita.paciente_id });

    // Encolar notificación WhatsApp + email
    await notifQueue.add('whatsapp', {
      to:       cita.whatsapp || cita.telefono,
      mensaje,
      citaId,
      userId:   cita.paciente_id,
    });

    await emailQueue.add('recordatorio', {
      to:       cita.email,
      nombre:   cita.nombre,
      mensaje,
      cita,
    });

    // Marcar recordatorio enviado
    await db.query(
      'UPDATE app.citas SET recordatorio_24h=true WHERE id=$1',
      [citaId]
    );

    logger.info(`Recordatorio enviado para cita ${citaId}`);
    return { ok: true, citaId };
  });

  // ─── IA: Resumen de sesión completada ─────────────────

  aiQueue.process('resumen-sesion', async (job) => {
    const { citaId } = job.data;
    const aiS = require('../services/aiService');
    const resumen = await aiS.generarResumenSesion({ citaId, usuario_id: null });
    logger.info(`Resumen IA generado para cita ${citaId}`);
    return { ok: true, resumen: resumen?.substring(0, 100) };
  });

  // ─── IA: Análisis mensual de paciente ─────────────────

  aiQueue.process('analisis-bienestar', async (job) => {
    const { pacienteId, solicitadoPor } = job.data;
    const aiS = require('../services/aiService');
    await aiS.analizarBienestar({ pacienteId, usuario_id: solicitadoPor });
    return { ok: true };
  });

  // ─── NOTIFICACIONES: WhatsApp (Twilio) ────────────────

  notifQueue.process('whatsapp', async (job) => {
    const { to, mensaje, citaId, userId, tipo='recordatorio_24h' } = job.data;
    if (!process.env.TWILIO_ACCOUNT_SID || !to) return { skipped: 'no config' };

    const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const telefono = to.replace(/\D/g, '');

    await twilio.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to:   `whatsapp:+57${telefono}`,
      body: mensaje,
    });

    const db = require('../config/database');
    await db.query(`
      INSERT INTO app.notificaciones (usuario_id, tipo, canal, cuerpo, enviada, enviada_at, ref_id)
      VALUES ($1, $2, 'whatsapp', $3, true, NOW(), $4)
    `, [userId, tipo, mensaje, citaId]);

    logger.info(`WhatsApp enviado a ${telefono}`);
    return { ok: true };
  });

  // ─── EMAILS ───────────────────────────────────────────

  emailQueue.process('recordatorio', async (job) => {
    const { to, nombre, mensaje, cita } = job.data;
    if (!process.env.SMTP_USER) return { skipped: 'no smtp' };

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
      from:    process.env.EMAIL_FROM,
      to,
      subject: `🗓️ Recordatorio: Tu cita es mañana, ${nombre}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f5f0e8;padding:32px;border-radius:16px">
          <h2 style="color:#2A7B6F">Psicóloga Luz Adriana 🧠❤️</h2>
          <p style="font-size:16px;color:#3D3025">${mensaje}</p>
          <hr style="border-color:#e8e0d0">
          <p style="font-size:14px;color:#6B5940">
            📅 Fecha: <strong>${cita.fecha}</strong><br>
            🕐 Hora: <strong>${cita.hora_inicio}</strong><br>
            💻 Modalidad: <strong>${cita.modalidad}</strong>
            ${cita.link_videollamada ? `<br>🔗 <a href="${cita.link_videollamada}">Enlace de videollamada</a>` : ''}
          </p>
          <p style="font-size:12px;color:#aaa">Si necesitas reagendar, contáctanos con anticipación.</p>
        </div>
      `,
    });

    logger.info(`Email recordatorio enviado a ${to}`);
    return { ok: true };
  });

  emailQueue.process('cita-evento', async job => {
    if(!process.env.SMTP_USER)return{skipped:'no smtp'};
    const db=require('../config/database');
    const nodemailer=require('nodemailer');
    const {rows}=await db.query(`SELECT c.*,u.nombre,u.apellido,u.email FROM app.citas c JOIN app.usuarios u ON u.id=c.paciente_id WHERE c.id=$1`,[job.data.citaId]);
    if(!rows.length)return{skipped:true}; const cita=rows[0],tipo=job.data.tipo;
    const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
    const titles={creada:'Cita creada correctamente',reprogramada:'Cita reprogramada',cancelada:'Cita cancelada'};
    const fecha=cita.fecha instanceof Date?cita.fecha.toISOString().slice(0,10):String(cita.fecha).slice(0,10);
    await transporter.sendMail({from:process.env.EMAIL_FROM||process.env.SMTP_USER,to:cita.email,subject:`${titles[tipo]} - Psicóloga Luz Adriana`,html:`<div style="font-family:Arial;max-width:600px;margin:auto"><h2 style="color:#247b6f">${titles[tipo]}</h2><p>Hola ${cita.nombre},</p><p>Fecha: <strong>${fecha}</strong><br>Hora: <strong>${String(cita.hora_inicio).slice(0,5)}</strong><br>Modalidad: <strong>${cita.modalidad}</strong></p><p>Conserva este correo como confirmación.</p></div>`});
    return{sent:true};
  });

  // ─── Manejadores de eventos ───────────────────────────

  [citaQueue, aiQueue, notifQueue, emailQueue].forEach(q => {
    q.on('failed', (job, err) => logger.error(`Cola [${q.name}] job ${job.id} falló:`, err.message));
    q.on('completed', (job) => logger.debug(`Cola [${q.name}] job ${job.id} completado`));
  });

  // ─── CRON: Recordatorios pendientes cada hora ──────────

  const cron = require('node-cron');
  cron.schedule('0 * * * *', async () => {
    try {
      const db = require('../config/database');
      const manana = new Date();
      manana.setDate(manana.getDate() + 1);
      const fechaStr = manana.toISOString().split('T')[0];

      const { rows } = await db.query(`
        SELECT id, hora_inicio FROM app.citas
        WHERE fecha = $1
          AND estado IN ('pendiente','confirmada')
          AND recordatorio_24h = false
      `, [fechaStr]);

      for (const cita of rows) {
        await citaQueue.add('recordatorio-cita', { citaId: cita.id }, {
          attempts: 3, removeOnComplete: true
        });
      }
      if (rows.length) logger.info(`Cron: encolados ${rows.length} recordatorios para ${fechaStr}`);
    } catch (e) {
      logger.error('Cron recordatorios error:', e);
    }
  });

  logger.info('✅ Bull queues y cron jobs inicializados');
}

module.exports = { citaQueue, aiQueue, notifQueue, emailQueue, initQueues };
