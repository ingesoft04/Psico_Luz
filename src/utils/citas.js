function listCacheKey(user, filters = {}) {
  const normalized = {
    page: Math.max(1, Number(filters.page) || 1),
    limit: Math.min(100, Math.max(1, Number(filters.limit) || 20)),
    estado: filters.estado || '',
    desde: filters.desde || '',
    hasta: filters.hasta || ''
  };
  return `citas:lista:${user.rol}:${user.id}:${normalized.page}:${normalized.limit}:${normalized.estado}:${normalized.desde}:${normalized.hasta}`;
}

function appointmentIsUpcoming(cita, today) {
  return String(cita.fecha).slice(0, 10) >= today &&
    !['cancelada', 'completada', 'no_asistio'].includes(cita.estado);
}

function addMinutes(hora, minutes = 60) {
  const [h, m] = String(hora).slice(0, 5).split(':').map(Number);
  const total = h * 60 + m + minutes;
  if (!Number.isFinite(total) || total >= 24 * 60) throw new Error('La hora final debe permanecer en el mismo día');
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

module.exports = { listCacheKey, appointmentIsUpcoming, addMinutes };
