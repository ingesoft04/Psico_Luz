// ════════════════════════════════════════════════════════════
//  server.js — Entry point de la API
//  Psicóloga Luz Adriana Backend
// ════════════════════════════════════════════════════════════

require('dotenv').config();
require('express-async-errors');

const app    = require('./app');
const logger = require('./config/logger');
const db     = require('./config/database');
const redis  = require('./config/redis');
const { initQueues } = require('./jobs/queues');

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    // 1. Verificar conexión a PostgreSQL
    await db.query('SELECT 1');
    logger.info('✅ PostgreSQL conectado');

    // 2. Verificar conexión a Redis
    await redis.ping();
    logger.info('✅ Redis conectado');

    // 3. Inicializar colas de trabajo (Bull + Redis)
    await initQueues();
    logger.info('✅ Colas de trabajo listas');

    // 4. Levantar servidor
    app.listen(PORT, () => {
      logger.info(`🚀 API lista en puerto ${PORT} [${process.env.NODE_ENV}]`);
      logger.info(`📋 Docs: http://localhost:${PORT}/api/v1/docs`);
    });

  } catch (err) {
    logger.error('❌ Error al iniciar servidor:', err);
    process.exit(1);
  }
}

// Manejo de errores no capturados
process.on('uncaughtException',  err => { logger.error('uncaughtException:', err);  process.exit(1); });
process.on('unhandledRejection', err => { logger.error('unhandledRejection:', err); process.exit(1); });
process.on('SIGTERM', async () => { logger.info('SIGTERM recibido, cerrando...'); await db.end(); process.exit(0); });

start();
