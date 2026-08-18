const AppError = require('./AppError');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value, label = 'Identificador') {
  if (!UUID_PATTERN.test(String(value || ''))) throw new AppError(`${label} inválido`, 400);
  return value;
}

function assertClinicalAuthor(note, userId) {
  if (note?.profesional_id && note.profesional_id !== userId) {
    throw new AppError('El registro clínico pertenece a otra profesional', 403);
  }
  return note;
}

function optionalNumber(value, min, max, label) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new AppError(`${label} debe estar entre ${min} y ${max}`, 400);
  }
  return number;
}

function optionalText(value, max, label) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (text.length > max) throw new AppError(`${label} supera el máximo de ${max} caracteres`, 400);
  return text || null;
}

function normalizeClinicalNote(body = {}) {
  const contenido = String(body.contenido || '').trim();
  if (!contenido) throw new AppError('El registro de atención es requerido', 400);
  if (contenido.length > 12000) throw new AppError('El registro de atención supera el máximo de 12000 caracteres', 400);
  return {
    contenido,
    estado_animo: optionalNumber(body.estado_animo, 1, 10, 'El estado emocional'),
    progreso: optionalNumber(body.progreso, 1, 5, 'El progreso'),
    tareas_asignadas: optionalText(body.tareas_asignadas, 5000, 'Las tareas acordadas'),
    next_steps: optionalText(body.next_steps, 5000, 'Los próximos pasos'),
  };
}

module.exports = { assertUuid, assertClinicalAuthor, normalizeClinicalNote, UUID_PATTERN };
