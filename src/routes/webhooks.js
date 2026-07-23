// ════════════════════════════════════════════════════════════
//  routes/webhooks.js — Endpoints para N8N · WhatsApp · Pagos
// ════════════════════════════════════════════════════════════

const router  = require('express').Router();
const crypto  = require('crypto');
const db      = require('../config/database');
const redis   = require('../config/redis');
const logger  = require('../config/logger');
const AppError = require('../utils/AppError');
const { citaQueue, aiQueue, notifQueue } = require('../jobs/queues');
const aiService = require('../services/aiService');
const bot = require('../services/botAppointmentService');

// ─── Verificar firma N8N ──────────────────────────────────

function verificarFirmaN8N(req, res, next) {
  const firma    = req.headers['x-n8n-signature'];
  const secreto  = process.env.N8N_WEBHOOK_SECRET;
  if (!secreto) return next(); // sin secreto configurado, pass
  if (!firma)   throw new AppError('Firma N8N requerida', 401);

  const esperado = crypto
    .createHmac('sha256', secreto)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperado)))
    throw new AppError('Firma N8N inválida', 403);
  next();
}

// ════════════════════════════════════════════════════════════
//  WEBHOOK N8N — Recibe eventos desde flujos de automatización
// ════════════════════════════════════════════════════════════

router.post('/n8n', verificarFirmaN8N, async (req, res) => {
  const { evento, payload } = req.body;
  logger.info(`Webhook N8N recibido: ${evento}`);

  switch (evento) {

    case 'generar_recordatorio': {
      const msg = await aiService.generarRecordatorio({
        citaId: payload.citaId,
        usuario_id: null,
      });
      res.json({ ok: true, data: { mensaje: msg } });
      break;
    }

    case 'nuevo_paciente_bienvenida': {
      await notifQueue.add('whatsapp', {
        to:      payload.whatsapp,
        mensaje: `¡Bienvenido/a ${payload.nombre} a la consulta de la Psicóloga Luz Adriana! 🌿 Estamos aquí para acompañarte en tu camino al bienestar. 💚`,
        userId:  payload.userId,
      });
      res.json({ ok: true });
      break;
    }

    case 'clasificar_motivo': {
      const categoria = await aiService.clasificarMotivo({ motivo: payload.motivo });
      res.json({ ok: true, data: { categoria } });
      break;
    }

    case 'cita_confirmada': {
      await db.query(
        "UPDATE app.citas SET estado='confirmada' WHERE id=$1",
        [payload.citaId]
      );
      await redis.invalidate('citas:lista:*');
      res.json({ ok: true });
      break;
    }

    case 'analisis_semanal': {
      // N8N puede disparar análisis masivos semanales
      const { rows } = await db.query(`
        SELECT DISTINCT paciente_id FROM app.citas
        WHERE fecha BETWEEN NOW() - INTERVAL '7 days' AND NOW()
          AND estado = 'completada'
      `);
      for (const { paciente_id } of rows) {
        await aiQueue.add('analisis-bienestar', { pacienteId: paciente_id });
      }
      res.json({ ok: true, pacientes: rows.length });
      break;
    }

    default:
      logger.warn(`Webhook N8N: evento desconocido [${evento}]`);
      res.status(400).json({ ok: false, message: `Evento desconocido: ${evento}` });
  }
});

// ════════════════════════════════════════════════════════════
//  WEBHOOK WHATSAPP — Recibe respuestas de pacientes (Twilio)
// ════════════════════════════════════════════════════════════

router.post('/whatsapp', async (req, res) => {
  const { From, Body, ProfileName } = req.body;
  const telefono = From?.replace('whatsapp:+57', '').replace(/\D/g, '');
  const mensaje  = Body?.trim().toLowerCase();

  logger.info(`WhatsApp entrante de ${telefono}: ${mensaje}`);

  const respuesta = await bot.respond('whatsapp',telefono,Body);

  // Responder via Twilio TwiML
  res.type('text/xml').send(`
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Message>${respuesta}</Message>
    </Response>
  `);
});

router.post('/telegram', async(req,res)=>{
  if(process.env.TELEGRAM_WEBHOOK_SECRET&&req.headers['x-telegram-bot-api-secret-token']!==process.env.TELEGRAM_WEBHOOK_SECRET)throw new AppError('Webhook Telegram no autorizado',401);
  const message=req.body.message||req.body.edited_message,chatId=String(message?.chat?.id||'');
  if(!chatId||!message?.text)return res.json({ok:true});
  const respuesta=await bot.respond('telegram',chatId,message.text);
  if(process.env.TELEGRAM_BOT_TOKEN)await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text:respuesta})});
  res.json({ok:true});
});

router.post('/asistente-web',async(req,res)=>{
  const session=String(req.body.sessionId||req.ip).slice(0,120);
  const respuesta=await bot.respond('web',session,req.body.mensaje);
  res.json({ok:true,data:{respuesta,sessionId:session}});
});

// ════════════════════════════════════════════════════════════
//  WEBHOOK PAGOS — Wompi / PSE / Stripe
// ════════════════════════════════════════════════════════════

router.post('/pago', async (req, res) => {
  const { event, data } = req.body;
  logger.info(`Webhook pago: ${event}`);

  if (event === 'transaction.updated') {
    const { id: refExt, status, amount_in_cents, reference } = data?.transaction || {};
    const monto = amount_in_cents / 100;
    const estadoPago = status === 'APPROVED' ? 'pagado'
                     : status === 'VOIDED'   ? 'reembolsado'
                     : 'fallido';

    await db.query(`
      UPDATE app.pagos SET estado=$1, referencia_ext=$2, updated_at=NOW()
      WHERE referencia_ext=$3 OR id::text=$4
    `, [estadoPago, refExt, refExt, reference]);

    // Si aprobado, confirmar cita automáticamente
    if (estadoPago === 'pagado') {
      const { rows } = await db.query(
        'SELECT cita_id, paciente_id FROM app.pagos WHERE referencia_ext=$1',
        [refExt]
      );
      if (rows.length) {
        await db.query(
          "UPDATE app.citas SET estado='confirmada' WHERE id=$1",
          [rows[0].cita_id]
        );
        await citaQueue.add('recordatorio-cita', { citaId: rows[0].cita_id });
        await redis.invalidate('citas:lista:*');
      }
    }
  }

  res.json({ ok: true });
});

// ─── Endpoint de salud para N8N ────────────────────────────
router.get('/ping', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

module.exports = router;
