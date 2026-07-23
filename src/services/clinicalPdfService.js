const PDFDocument = require('pdfkit');

const C={navy:'#1e3a5f',green:'#0dbb83',ink:'#35445b',muted:'#64748b',line:'#dce3ea',soft:'#f8fafc',mint:'#edfdf6',white:'#ffffff'};
const dateOnly=value=>value instanceof Date?value.toISOString().slice(0,10):String(value||'').slice(0,10);
const dateCO=value=>{if(!value)return'No registrada';const [y,m,d]=dateOnly(value).split('-');return`${d}/${m}/${y}`};
const time12=value=>{const [h,m]=String(value||'').slice(0,5).split(':').map(Number);if(!Number.isFinite(h))return'--';return`${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`};
const age=value=>{if(!value)return null;const born=new Date(`${dateOnly(value)}T12:00:00Z`),now=new Date();let n=now.getUTCFullYear()-born.getUTCFullYear();if(now.getUTCMonth()<born.getUTCMonth()||(now.getUTCMonth()===born.getUTCMonth()&&now.getUTCDate()<born.getUTCDate()))n--;return n};

class ClinicalPdfService {
  create(note) {
    const doc=new PDFDocument({size:'A4',margin:0,bufferPages:true,info:{Title:'Evolución de Historia Clínica - Psicología',Author:`${note.profesional_nombre} ${note.profesional_apellido}`,Subject:'Registro de Evolución Psicoterapéutica'}});
    const W=595.28,H=841.89,left=42,right=553,contentW=511;
    const professional=`${note.profesional_nombre} ${note.profesional_apellido}`;
    const recordCode=`HC-${new Date(note.firmado_at).getFullYear()}-${String(note.id).replace(/\D/g,'').slice(-5).padStart(5,'0')}`;
    const secureId=`sess_${String(note.id).replace(/-/g,'').slice(0,12)}`;
    const emitted=new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(note.firmado_at));
    const header=()=>{
      doc.rect(0,0,W,92).fill(C.navy);doc.rect(0,92,W,3).fill(C.green);
      doc.fillColor(C.white).font('Helvetica-Bold').fontSize(15).text('SISTEMA DE HISTORIA CLÍNICA',left,18,{width:310});
      doc.text('INTEROPERABLE',left,40,{width:310});
      doc.font('Helvetica').fontSize(8.5).fillColor('#d8e2ef').text('Registro de Evolución Psicoterapéutica - Ley 2015 de 2020 y Ley 527 de 1999',left,67,{width:380});
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.white).text(`Código Registro: ${recordCode}`,370,27,{width:183,align:'right'});
      doc.text(`Fecha de Emisión: ${emitted}`,350,42,{width:203,align:'right'});
      doc.font('Helvetica').text('COT',350,57,{width:203,align:'right'});
    };
    const footer=()=>{
      const range=doc.bufferedPageRange();
      for(let i=range.start;i<range.start+range.count;i++){doc.switchToPage(i);doc.strokeColor(C.line).moveTo(left,H-35).lineTo(right,H-35).stroke();doc.font('Helvetica').fontSize(7.5).fillColor('#7b8790').text('Documento Confidencial - Sujeto a Reserva Legal (Ley 1090 de 2006)',left,H-26,{width:380});doc.text(`Página ${i+1} de ${range.count}`,450,H-26,{width:103,align:'right'});}
    };
    const sectionTitle=(title,y)=>{doc.font('Helvetica-Bold').fontSize(11.5).fillColor(C.navy).text(title,left,y);doc.strokeColor(C.line).lineWidth(1).moveTo(left,y+18).lineTo(right,y+18).stroke();return y+28};
    const label=(text,x,y,w)=>doc.font('Helvetica-Bold').fontSize(8.8).fillColor('#526176').text(text,x,y,{width:w});
    const value=(text,x,y,w)=>doc.font('Helvetica').fontSize(9.2).fillColor('#172033').text(String(text||'No registrado'),x,y,{width:w});
    header();
    let y=112;y=sectionTitle('DATOS GENERALES DEL PACIENTE',y);
    doc.rect(left,y,contentW,91).fillAndStroke(C.soft,C.line);
    const rows=[0,23,46,69];rows.slice(1).forEach(off=>doc.strokeColor('#e7ecf1').moveTo(left,y+off).lineTo(right,y+off).stroke());
    label('Nombre Paciente:',48,y+7,120);value(`${note.paciente_nombre} ${note.paciente_apellido}`,174,y+7,370);
    const ident=[note.tipo_documento,note.numero_documento].filter(Boolean).join(' ')||'No registrada';
    label('Identificación:',48,y+30,110);value(ident,174,y+30,120);label('Fecha de Nacimiento:',300,y+30,125);const years=age(note.fecha_nacimiento);value(`${dateCO(note.fecha_nacimiento)}${years!==null?` (${years} años)`:''}`,425,y+30,120);
    label('Fecha de Sesión:',48,y+53,110);value(dateCO(note.fecha),174,y+53,120);label('Hora Inicio / Fin:',300,y+53,125);value(`${time12(note.hora_inicio)} - ${time12(note.hora_fin)}`,425,y+53,120);
    label('Número de Sesión:',48,y+76,110);value(`Sesión No. ${note.numero_sesion||1}`,174,y+76,120);label('Modalidad:',300,y+76,125);value(note.modalidad==='virtual'?'Virtual (Teleconsulta)':'Presencial',425,y+76,120);
    y+=110;y=sectionTitle('EVOLUCIÓN Y NOTAS DE LA SESIÓN',y);
    const sections=[['Registro de atención',note.contenido],['Tareas acordadas',note.tareas_asignadas],['Próximos pasos',note.next_steps]].filter(x=>x[1]);
    const evolution=sections.map(([t,v],i)=>`${i?`\n${t.toUpperCase()}\n`:''}${v}`).join('');
    const evoH=Math.max(92,doc.heightOfString(evolution,{width:contentW-24,align:'justify',lineGap:3})+24);
    doc.roundedRect(left,y,contentW,evoH,3).fillAndStroke(C.white,C.line);doc.font('Helvetica').fontSize(9.4).fillColor(C.ink).text(evolution,left+12,y+12,{width:contentW-24,align:'justify',lineGap:3});
    y+=evoH+22;
    const signatureText='Este documento ha sido cerrado electrónicamente y firmado digitalmente para garantizar su no repudio, autenticidad e integridad. No se permiten modificaciones posteriores a la firma de este registro.';
    const sigH=150;
    if(y+sigH>H-85){doc.addPage();header();y=115}
    doc.roundedRect(left,y,contentW,sigH,4).fillAndStroke(C.mint,C.green);
    doc.roundedRect(left+24,y+13,48,43,3).fill(C.green);doc.font('Helvetica-Bold').fontSize(8).fillColor(C.white).text('FIRMA\nDIGITAL',left+28,y+22,{width:40,align:'center'});
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#066348').text('Firma Electrónica y Sello de Seguridad Digital',left+84,y+14,{width:410});
    doc.font('Helvetica').fontSize(8.4).fillColor(C.ink).text(signatureText,left+84,y+34,{width:405,lineGap:2});
    doc.font('Helvetica-Bold').text('Firmado por:',left+84,y+78,{continued:true}).font('Helvetica').text(` ${professional} - Psicóloga`);
    doc.font('Helvetica-Bold').text('Tarjeta Profesional:',left+84,y+94,{continued:true}).font('Helvetica').text(` ${process.env.PSYCHOLOGIST_LICENSE||'No registrada'}  |  ID de Sesión Seguro: ${secureId}`);
    doc.font('Helvetica-Bold').text('Sello Hash de Integridad (SHA-256):',left+84,y+112);
    doc.roundedRect(left+84,y+126,405,17,2).fillAndStroke(C.white,'#b9edd8');doc.font('Courier').fontSize(6.8).fillColor('#087d5b').text(note.contenido_hash,left+91,y+131,{width:390});
    y+=sigH+18;doc.strokeColor(C.line).moveTo(left,y).lineTo(right,y).stroke();
    doc.font('Helvetica-Oblique').fontSize(7.7).fillColor(C.muted).text('"Este documento contiene información médica y psicológica de carácter privado y estrictamente confidencial. Su divulgación, copia o distribución no autorizada está prohibida y constituye una violación al secreto profesional y al derecho fundamental de Habeas Data."',left,y+10,{width:contentW,align:'center',lineGap:2});
    footer();return doc;
  }
  toBuffer(note){return new Promise((resolve,reject)=>{const chunks=[],doc=this.create(note);doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);doc.end()})}
}
module.exports=new ClinicalPdfService();
