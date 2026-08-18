const test = require('node:test');
const assert = require('node:assert/strict');
const { assertUuid, assertClinicalAuthor, normalizeClinicalNote } = require('../../src/utils/clinicalNote');

test('normaliza un registro clínico válido', () => {
  assert.deepEqual(normalizeClinicalNote({
    contenido: '  Evolución favorable.  ', estado_animo: '8', progreso: 4,
    tareas_asignadas: ' Respiración ', next_steps: '',
  }), {
    contenido: 'Evolución favorable.', estado_animo: 8, progreso: 4,
    tareas_asignadas: 'Respiración', next_steps: null,
  });
});

test('rechaza escalas clínicas fuera de rango', () => {
  assert.throws(() => normalizeClinicalNote({ contenido: 'Registro', estado_animo: 11 }), /entre 1 y 10/);
  assert.throws(() => normalizeClinicalNote({ contenido: 'Registro', progreso: 0 }), /entre 1 y 5/);
});

test('rechaza identificadores no UUID antes de consultar la base de datos', () => {
  assert.equal(assertUuid('b5725f1d-ecb1-4b9c-a0d3-dc632cace355'), 'b5725f1d-ecb1-4b9c-a0d3-dc632cace355');
  assert.throws(() => assertUuid('../paciente', 'Cita'), /Cita inválido/);
});

test('impide que otra profesional acceda al registro clínico', () => {
  const note = { profesional_id: 'profesional-a' };
  assert.equal(assertClinicalAuthor(note, 'profesional-a'), note);
  assert.throws(() => assertClinicalAuthor(note, 'profesional-b'), error => error.statusCode === 403);
});
