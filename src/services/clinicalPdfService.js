const PDFDocument = require('pdfkit');

class ClinicalPdfService {
  create(note) {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 52,
      info: {
        Title: 'Informe clínico confidencial',
        Author: `${note.profesional_nombre} ${note.profesional_apellido}`,
        Subject: 'Registro de sesión clínica',
      },
    });
    doc.rect(0, 0, 595, 842).fill('#ffffff');
    doc.rect(0, 0, 595, 54).fill('#173d38');
    doc.fillColor('#ffffff').fontSize(11)
      .text('PSICÓLOGA LUZ ADRIANA - DOCUMENTO CONFIDENCIAL', 52, 20, { align: 'center' });
    doc.fillColor('#173d38').fontSize(20)
      .text('Informe de sesión clínica', 52, 82, { align: 'center' }).moveDown();
    doc.fontSize(9).fillColor('#687b77')
      .text(`Clasificación SGSI: ${note.clasificacion} | Versión ${note.version}`, { align: 'center' }).moveDown(2);
    const date = note.fecha instanceof Date ? note.fecha.toISOString().slice(0, 10) : String(note.fecha).slice(0, 10);
    doc.fillColor('#173d38').fontSize(11).text(`Paciente: ${note.paciente_nombre} ${note.paciente_apellido}`);
    doc.text(`Fecha de sesión: ${date} ${String(note.hora_inicio).slice(0, 5)} | Modalidad: ${note.modalidad}`);
    doc.text(`Profesional: ${note.profesional_nombre} ${note.profesional_apellido} (${note.profesional_email})`).moveDown();
    const section = (title, value) => {
      if (!value) return;
      doc.fillColor('#247b6f').fontSize(12).text(title)
        .fillColor('#173d38').fontSize(10).text(String(value), { align: 'justify' }).moveDown();
    };
    section('Registro de atención', note.contenido);
    section('Estado emocional (1-10)', note.estado_animo);
    section('Progreso (1-5)', note.progreso);
    section('Tareas acordadas', note.tareas_asignadas);
    section('Próximos pasos', note.next_steps);
    doc.moveDown().strokeColor('#d6dfdc').moveTo(52, doc.y).lineTo(543, doc.y).stroke().moveDown();
    doc.fontSize(8).fillColor('#687b77').text(`Firmado electrónicamente: ${new Date(note.firmado_at).toISOString()}`);
    doc.text(`Protegido: ${new Date(note.protegido_at).toISOString()}`);
    doc.text(`Huella SHA-256: ${note.contenido_hash}`);
    doc.text(`Sello HMAC-SHA256: ${note.firma_hmac}`);
    doc.text(`Código de documento: ${note.id}`);
    doc.moveDown().fillColor('#a34242')
      .text('Documento confidencial sujeto a controles del SGSI. Su divulgación no autorizada está prohibida.', { align: 'center' });
    return doc;
  }

  toBuffer(note) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      const doc = this.create(note);
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    });
  }
}

module.exports = new ClinicalPdfService();
