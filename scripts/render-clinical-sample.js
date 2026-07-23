const fs = require('fs');
const path = require('path');
const pdf = require('../src/services/clinicalPdfService');

const output = path.resolve(__dirname, '../output/pdf/evolucion-historia-clinica-firmada-ejemplo.pdf');
fs.mkdirSync(path.dirname(output), { recursive: true });

const note = {
  id: '99a8e2b7-c310-4c85-9120-123456789012',
  paciente_nombre: 'Paciente',
  paciente_apellido: 'Ejemplo',
  tipo_documento: 'CC',
  numero_documento: '1.000.000.XXX',
  fecha_nacimiento: new Date('1991-04-12T00:00:00Z'),
  fecha: new Date('2026-07-16T00:00:00Z'),
  hora_inicio: '08:00:00',
  hora_fin: '08:50:00',
  numero_sesion: 6,
  modalidad: 'virtual',
  contenido: 'El paciente asiste de manera puntual a la sesión programada. Se observa con actitud colaborativa y discurso coherente. Durante el encuentro se realiza seguimiento a las tareas acordadas y se trabajan estrategias para el manejo emocional. El paciente responde positivamente a las intervenciones realizadas.',
  tareas_asignadas: 'Mantener el autorregistro y practicar diariamente la estrategia acordada.',
  next_steps: 'Continuar seguimiento en la próxima sesión y evaluar avances.',
  profesional_nombre: 'Luz Adriana',
  profesional_apellido: 'Psicóloga',
  profesional_email: 'psicologa@psicologaluz.local',
  firmado_at: new Date('2026-07-16T15:05:00Z'),
  protegido_at: new Date('2026-07-16T15:06:00Z'),
  contenido_hash: '8f6c3a1b5d7e9f2a4b6c8d0e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a',
};

const stream = fs.createWriteStream(output);
const doc = pdf.create(note);
doc.pipe(stream);
doc.end();
stream.on('finish', () => process.stdout.write(output));
