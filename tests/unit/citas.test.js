const test = require('node:test');
const assert = require('node:assert/strict');
const { listCacheKey, appointmentIsUpcoming, addMinutes } = require('../../src/utils/citas');

const user = { id:'paciente-1', rol:'paciente' };

test('la clave de caché cambia al cambiar filtros de fecha', () => {
  const current = listCacheKey(user, { desde:'2026-07-15', hasta:'2026-08-15' });
  const future = listCacheKey(user, { desde:'2027-01-01', hasta:'2027-02-01' });
  assert.notEqual(current, future);
  assert.match(current, /2026-07-15/);
});

test('la clave de caché separa paginación, límite y estado', () => {
  assert.notEqual(listCacheKey(user,{page:1}), listCacheKey(user,{page:2}));
  assert.notEqual(listCacheKey(user,{limit:20}), listCacheKey(user,{limit:50}));
  assert.notEqual(listCacheKey(user,{estado:'pendiente'}), listCacheKey(user,{estado:'cancelada'}));
});

test('una cita futura pendiente debe aparecer en Mis próximas citas', () => {
  assert.equal(appointmentIsUpcoming({fecha:'2026-07-24T00:00:00.000Z',estado:'pendiente'},'2026-07-15'),true);
  assert.equal(appointmentIsUpcoming({fecha:'2026-07-24',estado:'cancelada'},'2026-07-15'),false);
  assert.equal(appointmentIsUpcoming({fecha:'2026-07-14',estado:'pendiente'},'2026-07-15'),false);
});

test('calcula correctamente el final de una sesión', () => {
  assert.equal(addMinutes('11:00',60),'12:00');
  assert.equal(addMinutes('07:30',60),'08:30');
  assert.throws(()=>addMinutes('23:30',60),/mismo día/);
});
