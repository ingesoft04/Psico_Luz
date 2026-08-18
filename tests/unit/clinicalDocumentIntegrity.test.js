const test = require('node:test');
const assert = require('node:assert/strict');
const integrity = require('../../src/services/clinicalDocumentIntegrity');

const note = {
  id: 'note-1', cita_id: 'appointment-1', paciente_id: 'patient-1', profesional_id: 'professional-1',
  contenido: 'Contenido clínico', estado_animo: 7, progreso: 4,
  tareas_asignadas: 'Tarea', next_steps: 'Seguimiento', version: 1,
};

test('detecta cualquier alteración posterior a la firma', () => {
  const contenido_hash = integrity.hash(note);
  const signed = { ...note, contenido_hash, firma_hmac: integrity.sign(contenido_hash) };
  assert.equal(integrity.verify(signed), true);
  assert.equal(integrity.verify({ ...signed, contenido: 'Contenido alterado' }), false);
});

test('rechaza registros sin firma o hash', () => {
  assert.equal(integrity.verify(note), false);
  assert.equal(integrity.verify({ ...note, contenido_hash: integrity.hash(note) }), false);
});

test('exige una clave de firma robusta en producción', () => {
  const previousEnv = process.env.NODE_ENV;
  const previousSecret = process.env.CLINICAL_SIGNING_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    process.env.CLINICAL_SIGNING_SECRET = 'corta';
    assert.throws(() => integrity.sign('digest'), /al menos 32 caracteres/);
    process.env.CLINICAL_SIGNING_SECRET = 'una-clave-segura-de-por-lo-menos-32-caracteres';
    assert.match(integrity.sign('digest'), /^[a-f0-9]{64}$/);
  } finally {
    if (previousEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnv;
    if (previousSecret === undefined) delete process.env.CLINICAL_SIGNING_SECRET; else process.env.CLINICAL_SIGNING_SECRET = previousSecret;
  }
});
