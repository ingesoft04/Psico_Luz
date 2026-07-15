// ════════════════════════════════════════════════════════════
//  app.js — Configuración de Express
// ════════════════════════════════════════════════════════════

const express     = require('express');
const helmet      = require('helmet');
const cors        = require('cors');
const compression = require('compression');
const morgan      = require('morgan');
const logger      = require('./config/logger');
const { globalErrorHandler, notFound } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

// Routers
const authRoutes         = require('./routes/auth');
const usuariosRoutes     = require('./routes/usuarios');
const citasRoutes        = require('./routes/citas');
const disponibilidadRoutes = require('./routes/disponibilidad');
const pagosRoutes        = require('./routes/pagos');
const notasRoutes        = require('./routes/notas');
const notificacionesRoutes = require('./routes/notificaciones');
const aiRoutes           = require('./routes/ai');
const adminRoutes        = require('./routes/admin');
const webhookRoutes      = require('./routes/webhooks');

const app = express();

// Nginx es el único proxy frontal del contenedor. Permite obtener la IP real
// para auditoría y rate limiting sin confiar en cadenas arbitrarias de proxies.
app.set('trust proxy', 1);

// ─── Seguridad ────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost',
    process.env.APP_URL || 'http://localhost',
    'http://localhost:3000',  // dev frontend
    'http://localhost:5678',  // N8N
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-N8N-Signature']
}));

// ─── Parsers ──────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// ─── Logging HTTP ─────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: msg => logger.http(msg.trim()) }
}));

// ─── Rate Limiting global ─────────────────────────────────
app.use('/api/', apiLimiter);

// ─── Health check (para Docker + load balancers) ──────────
app.get('/health', async (req, res) => {
  const db    = require('./config/database');
  const redis = require('./config/redis');
  try {
    await db.query('SELECT 1');
    await redis.ping();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'Psicóloga Luz Adriana API',
      version: '1.0.0',
      uptime: Math.floor(process.uptime()),
      checks: { postgres: 'ok', redis: 'ok' }
    });
  } catch (e) {
    res.status(503).json({ status: 'unhealthy', error: e.message });
  }
});

// ─── Rutas API v1 ─────────────────────────────────────────
const api = '/api/v1';
app.use(`${api}/auth`,            authRoutes);
app.use(`${api}/usuarios`,        usuariosRoutes);
app.use(`${api}/citas`,           citasRoutes);
app.use(`${api}/disponibilidad`,  disponibilidadRoutes);
app.use(`${api}/pagos`,           pagosRoutes);
app.use(`${api}/notas`,           notasRoutes);
app.use(`${api}/notificaciones`,  notificacionesRoutes);
app.use(`${api}/ai`,              aiRoutes);
app.use(`${api}/admin`,           adminRoutes);
app.use(`${api}/webhooks`,        webhookRoutes);

// ─── Documentación básica ─────────────────────────────────
app.get('/api/v1/docs', (req, res) => {
  res.json({
    nombre: 'Psicóloga Luz Adriana — API',
    version: '1.0.0',
    endpoints: {
      auth:           `POST ${api}/auth/register | /login | /refresh | /logout | /forgot-password | /reset-password`,
      usuarios:       `GET/PUT ${api}/usuarios/me | GET ${api}/usuarios (admin)`,
      citas:          `GET/POST/PUT/DELETE ${api}/citas | ${api}/citas/:id`,
      disponibilidad: `GET ${api}/disponibilidad | ${api}/disponibilidad/slots`,
      pagos:          `GET/POST ${api}/pagos | ${api}/pagos/:id`,
      notas:          `GET/POST ${api}/notas/:citaId`,
      notificaciones: `GET ${api}/notificaciones | PUT ${api}/notificaciones/:id/leer`,
      ai:             `POST ${api}/ai/recordatorio | /resumen | /clasificar | /chat`,
      admin:          `GET ${api}/admin/dashboard | /pacientes | /citas | /reportes`,
      webhooks:       `POST ${api}/webhooks/n8n | /whatsapp | /pago`,
    }
  });
});

// ─── 404 y error global ───────────────────────────────────
app.use(notFound);
app.use(globalErrorHandler);

module.exports = app;
