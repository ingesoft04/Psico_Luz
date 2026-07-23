const db=require('../config/database');
const redis=require('../config/redis');
const AppError=require('../utils/AppError');
const {addMinutes}=require('../utils/citas');
const automation=require('./appointmentAutomationService');

class BotAppointmentService {
  async user(channel,identifier){
    if(channel==='telegram')return (await db.query('SELECT * FROM app.usuarios WHERE telegram_chat_id=$1 AND activo=true',[identifier])).rows[0];
    const digits=String(identifier||'').replace(/\D/g,'');
    return (await db.query(`SELECT * FROM app.usuarios WHERE activo=true AND
      (RIGHT(REGEXP_REPLACE(COALESCE(whatsapp,''),'\\D','','g'),10)=RIGHT($1,10)
       OR RIGHT(REGEXP_REPLACE(COALESCE(telefono,''),'\\D','','g'),10)=RIGHT($1,10))`,[digits])).rows[0];
  }
  async slots(fecha,modalidad){
    const day=new Date(`${fecha}T00:00:00-05:00`).getDay();
    const blocked=await db.query('SELECT 1 FROM app.dias_bloqueados WHERE fecha=$1',[fecha]);if(blocked.rowCount)return[];
    const ranges=await db.query('SELECT hora_inicio,hora_fin FROM app.disponibilidad WHERE dia_semana=$1 AND modalidad=$2 AND activo=true',[day,modalidad]);
    const booked=await db.query(`SELECT hora_inicio FROM app.citas WHERE fecha=$1 AND modalidad=$2 AND estado NOT IN('cancelada','no_asistio')`,[fecha,modalidad]);
    const used=new Set(booked.rows.map(x=>String(x.hora_inicio).slice(0,5))),result=[];
    for(const r of ranges.rows){let [h,m]=String(r.hora_inicio).split(':').map(Number),[eh,em]=String(r.hora_fin).split(':').map(Number);for(let n=h*60+m;n+60<=eh*60+em;n+=60){const value=`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;if(!used.has(value)&&new Date(`${fecha}T${value}:00-05:00`).getTime()>Date.now()+1800000)result.push(value)}}
    return result;
  }
  async book(user,{fecha,modalidad,hora},channel){
    const client=await db.connect();let cita;
    try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${fecha}:${hora}:${modalidad}`]);
      const conflict=await client.query(`SELECT 1 FROM app.citas WHERE fecha=$1 AND hora_inicio=$2 AND modalidad=$3 AND estado NOT IN('cancelada','no_asistio')`,[fecha,hora,modalidad]);
      if(conflict.rowCount)throw new AppError('Ese horario acaba de ser reservado',409);
      const {rows}=await client.query(`INSERT INTO app.citas(paciente_id,fecha,hora_inicio,hora_fin,modalidad,tipo_sesion,motivo,created_by,canal_origen)
        VALUES($1,$2,$3,$4,$5,'individual','Agendada mediante asistente virtual',$1,$6) RETURNING *`,[user.id,fecha,hora,addMinutes(hora),modalidad,channel]);
      cita=rows[0];await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
    await redis.invalidate('citas:lista:*');await redis.del(`slots:${fecha}:${modalidad}`);await automation.created(cita.id);return cita;
  }
  async cancel(user,id,channel){
    const {rows}=await db.query(`UPDATE app.citas SET estado='cancelada',cancelada_por=$1,motivo_cancelacion=$2,updated_at=NOW()
      WHERE id=$3 AND paciente_id=$1 AND estado NOT IN('cancelada','completada') RETURNING *`,[user.id,`Cancelada mediante ${channel}`,id]);
    if(!rows.length)throw new AppError('La cita ya no está disponible para cancelar',409);
    await redis.invalidate('citas:lista:*');await redis.del(`slots:${rows[0].fecha}:${rows[0].modalidad}`);await automation.cancelled(id);return rows[0];
  }
  async respond(channel,identifier,text){
    const input=String(text||'').trim().toLowerCase();
    const user=await this.user(channel,identifier),base=process.env.APP_URL||'http://localhost:8180';
    if(!user&&channel!=='web')return `Hola. Para proteger tus datos primero debes registrarte en ${base}/agenda.html. En WhatsApp usa el mismo número registrado; para Telegram solicita vinculación segura a la consulta.`;
    if(!user&&channel==='web'&&(input.includes('agendar')||input.includes('cita')||input.includes('cancelar')))return`Para agendar, consultar o cancelar de forma segura, abre ${base}/agenda.html e inicia sesión.`;
    const faq=[['precio',process.env.SESSION_PRICE_TEXT||'El valor depende del tipo de sesión; la consulta te confirmará el valor vigente.'],['horario','Puedes abrir la agenda y consultar horarios disponibles en tiempo real.'],['virtual','Las sesiones virtuales reciben un enlace seguro cerca de la hora programada.'],['ubicación',process.env.OFFICE_ADDRESS||'La dirección se confirma al agendar una sesión presencial.']];
    if(!user&&channel==='web')return faq.find(([word])=>input.includes(word))?.[1]||'Puedo ayudarte con citas, horarios, modalidad virtual, ubicación y preguntas frecuentes.';
    const key=`bot:${channel}:${identifier}`,state=JSON.parse(await redis.get(key)||'{}');
    if(['salir','reiniciar','cancelar proceso'].includes(input)){await redis.del(key);return'Proceso cerrado. Escribe AGENDAR, MIS CITAS, CANCELAR CITA o AYUDA.'}
    if(state.step==='date'){if(!/^\d{4}-\d{2}-\d{2}$/.test(input))return'Escribe la fecha en formato AAAA-MM-DD.';state.fecha=input;state.step='modality';await redis.setex(key,900,JSON.stringify(state));return'¿Modalidad PRESENCIAL o VIRTUAL?'}
    if(state.step==='modality'){if(!['presencial','virtual'].includes(input))return'Responde PRESENCIAL o VIRTUAL.';state.modalidad=input;state.slots=await this.slots(state.fecha,input);if(!state.slots.length){await redis.del(key);return'No hay horarios disponibles ese día. Escribe AGENDAR para intentar otra fecha.'}state.step='slot';await redis.setex(key,900,JSON.stringify(state));return`Horarios disponibles:\n${state.slots.map((x,i)=>`${i+1}. ${x}`).join('\n')}\nResponde con el número.`}
    if(state.step==='slot'){const hora=state.slots?.[Number(input)-1];if(!hora)return'Responde con uno de los números mostrados.';const cita=await this.book(user,{...state,hora},channel);await redis.del(key);return`Cita confirmada: ${String(cita.fecha).slice(0,10)} a las ${String(cita.hora_inicio).slice(0,5)}, ${cita.modalidad}. Recibirás confirmación por correo y recordatorio un día antes.`}
    if(state.step==='cancel'){const id=state.ids?.[Number(input)-1];if(!id)return'Responde con uno de los números mostrados.';const cita=await this.cancel(user,id,channel);await redis.del(key);return`Cita del ${String(cita.fecha).slice(0,10)} cancelada correctamente.`}
    if(input.includes('agendar')||input.includes('sacar cita')){await redis.setex(key,900,JSON.stringify({step:'date'}));return'Claro. ¿Para qué fecha deseas la cita? Escribe AAAA-MM-DD.'}
    if(input.includes('mis citas')){const {rows}=await db.query(`SELECT id,fecha,hora_inicio,modalidad FROM app.citas WHERE paciente_id=$1 AND fecha>=CURRENT_DATE AND estado IN('pendiente','confirmada') ORDER BY fecha,hora_inicio`,[user.id]);return rows.length?rows.map((c,i)=>`${i+1}. ${String(c.fecha).slice(0,10)} ${String(c.hora_inicio).slice(0,5)} ${c.modalidad}`).join('\n'):'No tienes citas próximas.'}
    if(input.includes('cancelar cita')){const {rows}=await db.query(`SELECT id,fecha,hora_inicio,modalidad FROM app.citas WHERE paciente_id=$1 AND fecha>=CURRENT_DATE AND estado IN('pendiente','confirmada') ORDER BY fecha,hora_inicio`,[user.id]);if(!rows.length)return'No tienes citas cancelables.';await redis.setex(key,900,JSON.stringify({step:'cancel',ids:rows.map(x=>x.id)}));return`¿Cuál deseas cancelar?\n${rows.map((c,i)=>`${i+1}. ${String(c.fecha).slice(0,10)} ${String(c.hora_inicio).slice(0,5)}`).join('\n')}`}
    return faq.find(([word])=>input.includes(word))?.[1]||'Puedo ayudarte con AGENDAR, MIS CITAS, CANCELAR CITA, horarios, modalidad virtual, ubicación y preguntas frecuentes.';
  }
}
module.exports=new BotAppointmentService();
