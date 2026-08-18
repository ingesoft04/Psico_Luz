const crypto = require('crypto');

class ClinicalDocumentIntegrity {
  signingSecret() {
    const secret = process.env.CLINICAL_SIGNING_SECRET;
    if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32)) {
      throw new Error('CLINICAL_SIGNING_SECRET debe tener al menos 32 caracteres en producción');
    }
    return secret || 'development-only';
  }

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
    return crypto.createHmac('sha256', this.signingSecret()).update(digest).digest('hex');
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
