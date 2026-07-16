const nodemailer = require('nodemailer');

class ClinicalEmailService {
  configured() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  }

  async send({ to, patientName, pdf, filename }) {
    if (!this.configured()) throw new Error('El servidor SMTP no está configurado');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to,
      subject: `Documento clínico protegido - ${patientName}`,
      text: 'Se adjunta el documento clínico solicitado. Contiene información confidencial; custódielo conforme a las políticas del SGSI.',
      attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
    });
  }
}

module.exports = new ClinicalEmailService();
