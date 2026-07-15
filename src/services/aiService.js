// ════════════════════════════════════════════════════════════
//  services/aiService.js — Claude + Gemini Integration
//  Listo para N8N automation
// ════════════════════════════════════════════════════════════

const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db     = require('../config/database');
const redis  = require('../config/redis');
const logger = require('../config/logger');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const gemini    = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─── Obtener plantilla de prompt ──────────────────────────

async function getPlantilla(nombre) {
  const cacheKey = `prompt:plantilla:${nombre}`;
  return redis.cacheOr(cacheKey, async () => {
    const { rows } = await db.query(
      'SELECT * FROM ai.plantillas_prompt WHERE nombre=$1 AND activa=true',
      [nombre]
    );
    return rows[0] || null;
  }, 3600);
}

// ─── Rellenar variables en plantilla ──────────────────────

function rellenarPlantilla(plantilla, vars = {}) {
  return plantilla.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || `[${key}]`);
}

// ─── Log de interacción IA ────────────────────────────────

async function logIA({ usuario_id, proveedor, tipo_accion, modelo, prompt,
                        respuesta, tokens_entrada, tokens_salida, costo_usd,
                        latencia_ms, exitoso = true, error_msg, ref_tipo, ref_id }) {
  try {
    await db.query(`
      INSERT INTO ai.interacciones
        (usuario_id, proveedor, tipo_accion, modelo, prompt, respuesta,
         tokens_entrada, tokens_salida, costo_usd, latencia_ms,
         exitoso, error_msg, ref_tipo, ref_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    `, [usuario_id, proveedor, tipo_accion, modelo, prompt, respuesta,
        tokens_entrada, tokens_salida, costo_usd, latencia_ms,
        exitoso, error_msg, ref_tipo, ref_id]);
  } catch (e) {
    logger.error('Error al guardar log IA:', e);
  }
}

// ════════════════════════════════════════════════════════════
//  CLAUDE — Llamada genérica
// ════════════════════════════════════════════════════════════

async function llamarClaude({ sistema, prompt, max_tokens = 1024, usuario_id, tipo_accion, ref_tipo, ref_id }) {
  const modelo = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
  const inicio = Date.now();
  let respuesta, tokens_entrada, tokens_salida, exitoso = true, error_msg;

  try {
    const msg = await anthropic.messages.create({
      model: modelo,
      max_tokens,
      system: sistema || 'Eres el asistente inteligente de la Psicóloga Luz Adriana. Responde siempre en español, con empatía y profesionalismo.',
      messages: [{ role: 'user', content: prompt }],
    });

    respuesta      = msg.content[0]?.text || '';
    tokens_entrada = msg.usage?.input_tokens;
    tokens_salida  = msg.usage?.output_tokens;

    // Costo aproximado Claude Sonnet: $3/MTok entrada, $15/MTok salida
    const costo_usd = ((tokens_entrada || 0) * 0.000003) + ((tokens_salida || 0) * 0.000015);

    await logIA({ usuario_id, proveedor: 'claude', tipo_accion, modelo, prompt, respuesta,
                  tokens_entrada, tokens_salida, costo_usd,
                  latencia_ms: Date.now() - inicio, exitoso, ref_tipo, ref_id });

    return respuesta;

  } catch (err) {
    exitoso   = false;
    error_msg = err.message;
    await logIA({ usuario_id, proveedor: 'claude', tipo_accion, modelo, prompt,
                  latencia_ms: Date.now() - inicio, exitoso, error_msg, ref_tipo, ref_id });
    throw err;
  }
}

// ════════════════════════════════════════════════════════════
//  GEMINI — Llamada genérica
// ════════════════════════════════════════════════════════════

async function llamarGemini({ prompt, usuario_id, tipo_accion, ref_tipo, ref_id }) {
  const modelNombre = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const inicio      = Date.now();

  try {
    const model    = gemini.getGenerativeModel({ model: modelNombre });
    const result   = await model.generateContent(prompt);
    const respuesta = result.response.text();

    await logIA({ usuario_id, proveedor: 'gemini', tipo_accion, modelo: modelNombre,
                  prompt, respuesta, latencia_ms: Date.now() - inicio,
                  exitoso: true, ref_tipo, ref_id });

    return respuesta;

  } catch (err) {
    await logIA({ usuario_id, proveedor: 'gemini', tipo_accion, modelo: modelNombre,
                  prompt, latencia_ms: Date.now() - inicio, exitoso: false,
                  error_msg: err.message, ref_tipo, ref_id });
    throw err;
  }
}

// ════════════════════════════════════════════════════════════
//  ACCIONES DE ALTO NIVEL (usadas por rutas y N8N)
// ════════════════════════════════════════════════════════════

/**
 * Genera mensaje de recordatorio personalizado para una cita
 */
async function generarRecordatorio({ citaId, usuario_id }) {
  const cacheKey = `ai:recordatorio:${citaId}`;
  const cached   = await redis.get(cacheKey);
  if (cached) return cached;

  const { rows } = await db.query(`
    SELECT c.fecha, c.hora_inicio, c.modalidad, c.link_videollamada,
           u.nombre, u.apellido
    FROM app.citas c
    JOIN app.usuarios u ON u.id = c.paciente_id
    WHERE c.id = $1
  `, [citaId]);

  if (!rows.length) throw new Error('Cita no encontrada');
  const cita = rows[0];

  const plantilla = await getPlantilla('recordatorio_cita');
  const prompt    = plantilla
    ? rellenarPlantilla(plantilla.plantilla, {
        nombre_paciente: `${cita.nombre} ${cita.apellido}`,
        fecha:     new Date(cita.fecha).toLocaleDateString('es-CO', { weekday:'long', year:'numeric', month:'long', day:'numeric' }),
        hora:      cita.hora_inicio,
        modalidad: cita.modalidad,
      })
    : `Crea un recordatorio amable para ${cita.nombre} por su cita el ${cita.fecha} a las ${cita.hora_inicio}.`;

  const respuesta = await llamarClaude({
    prompt,
    sistema: plantilla?.sistema,
    tipo_accion: 'recordatorio',
    usuario_id, ref_tipo: 'cita', ref_id: citaId
  });

  await redis.setex(cacheKey, 3600, respuesta);
  return respuesta;
}

/**
 * Genera resumen automático de una sesión
 */
async function generarResumenSesion({ citaId, usuario_id }) {
  const { rows } = await db.query(
    'SELECT contenido FROM app.notas_sesion WHERE cita_id=$1 ORDER BY created_at DESC LIMIT 1',
    [citaId]
  );
  if (!rows.length) return null;

  const plantilla = await getPlantilla('resumen_sesion');
  const prompt    = plantilla
    ? rellenarPlantilla(plantilla.plantilla, { notas: rows[0].contenido })
    : `Resume esta nota clínica profesionalmente: ${rows[0].contenido}`;

  const resumen = await llamarClaude({
    prompt,
    sistema: plantilla?.sistema,
    max_tokens: 800,
    tipo_accion: 'resumen',
    usuario_id, ref_tipo: 'cita', ref_id: citaId
  });

  // Guardar resumen en la nota
  await db.query(
    'UPDATE app.notas_sesion SET resumen_ia=$1 WHERE cita_id=$2',
    [resumen, citaId]
  );

  return resumen;
}

/**
 * Clasifica motivo de consulta con Gemini (más rápido y económico)
 */
async function clasificarMotivo({ motivo, usuario_id }) {
  const plantilla = await getPlantilla('clasificar_motivo');
  const prompt    = plantilla
    ? rellenarPlantilla(plantilla.plantilla, { motivo })
    : `Clasifica este motivo de consulta en una categoría clínica: ${motivo}`;

  return llamarGemini({ prompt, usuario_id, tipo_accion: 'clasificacion' });
}

/**
 * Chat de soporte emocional (asistente virtual 24/7)
 * Historial guardado en Redis para continuidad
 */
async function chatAsistente({ userId, mensaje, sessionId }) {
  const histKey  = `ai:chat:${sessionId}`;
  const histRaw  = await redis.get(histKey);
  const historial = histRaw ? JSON.parse(histRaw) : [];

  historial.push({ role: 'user', content: mensaje });

  const modelo = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
  const msg = await anthropic.messages.create({
    model: modelo,
    max_tokens: 512,
    system: `Eres el asistente virtual de apoyo emocional de la Psicóloga Luz Adriana. 
Tu rol es escuchar con empatía, orientar hacia recursos de ayuda profesional y NUNCA dar diagnósticos.
Si detectas riesgo de autolesión, proporciona la línea de crisis: 106 (Colombia).
Responde siempre en español, de forma cálida y breve.`,
    messages: historial,
  });

  const respuesta = msg.content[0]?.text || '';
  historial.push({ role: 'assistant', content: respuesta });

  // Mantener solo últimos 20 mensajes para no exceder contexto
  const histRecortado = historial.slice(-20);
  await redis.setex(histKey, redis.TTL.SESSION, JSON.stringify(histRecortado));

  await logIA({
    usuario_id: userId, proveedor: 'claude', tipo_accion: 'respuesta_auto',
    modelo, prompt: mensaje, respuesta,
    tokens_entrada: msg.usage?.input_tokens,
    tokens_salida:  msg.usage?.output_tokens,
    latencia_ms: 0, exitoso: true
  });

  return { respuesta, sessionId };
}

/**
 * Análisis de sentimiento / bienestar del paciente (para dashboard)
 */
async function analizarBienestar({ pacienteId, usuario_id }) {
  const { rows } = await db.query(`
    SELECT ns.contenido, ns.estado_animo, ns.progreso, c.fecha
    FROM app.notas_sesion ns
    JOIN app.citas c ON c.id = ns.cita_id
    WHERE ns.paciente_id = $1
    ORDER BY c.fecha DESC
    LIMIT 5
  `, [pacienteId]);

  if (!rows.length) return null;

  const resumen = rows.map(r =>
    `Fecha: ${r.fecha} | Ánimo: ${r.estado_animo}/10 | Progreso: ${r.progreso}/5\n${r.contenido}`
  ).join('\n---\n');

  return llamarClaude({
    prompt: `Analiza las últimas 5 notas de sesión de este paciente y genera:
1. Tendencia general del estado de ánimo
2. Áreas de mejora observadas
3. Recomendaciones para próximas sesiones
4. Nivel de riesgo (bajo/medio/alto)

Notas:\n${resumen}`,
    sistema: 'Eres un asistente clínico experto. Sé objetivo, preciso y confidencial.',
    max_tokens: 600,
    tipo_accion: 'analisis',
    usuario_id, ref_tipo: 'paciente', ref_id: pacienteId
  });
}

module.exports = {
  llamarClaude,
  llamarGemini,
  generarRecordatorio,
  generarResumenSesion,
  clasificarMotivo,
  chatAsistente,
  analizarBienestar,
  getPlantilla,
};
