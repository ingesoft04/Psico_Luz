const crypto = require('crypto');

class ClinicalDocumentIntegrity {
  canonical(note) {
    return JSON.stringify({
      id: note.id,
      cita_id: note.cita_id,
      paciente_id: note.paciente_id,
      profesional_id: note.profesional_id,
      contenido: note.contenido,
      estado_animo: note.estado_animo,
      progreso: note.progreso,
      tareas_asignadas: note.tareas_asignadas,
      next_steps: note.next_steps,
      version: note.version,
    });
  }

  hash(note) {
    return crypto.createHash('sha256').update(this.canonical(note)).digest('hex');
  }

  sign(digest) {
    const secret = process.env.CLINICAL_SIGNING_SECRET || 'development-only';
    return crypto.createHmac('sha256', secret).update(digest).digest('hex');
  }

  verify(note) {
    if (!note.contenido_hash || !note.firma_hmac) return false;
    const digest = this.hash(note);
    const expected = this.sign(digest);
    return note.contenido_hash === digest
      && note.firma_hmac.length === expected.length
      && crypto.timingSafeEqual(Buffer.from(note.firma_hmac), Buffer.from(expected));
  }
}

module.exports = new ClinicalDocumentIntegrity();
