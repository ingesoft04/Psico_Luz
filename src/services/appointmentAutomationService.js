const db=require('../config/database');
const { citaQueue, emailQueue, notifQueue }=require('../jobs/queues');

class AppointmentAutomationService {
  date(value){return value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10)}
  async details(id){
    const {rows}=await db.query(`SELECT c.*,u.nombre paciente_nombre,u.apellido paciente_apellido,u.email,u.telefono,u.whatsapp
      FROM app.citas c JOIN app.usuarios u ON u.id=c.paciente_id WHERE c.id=$1`,[id]);
    return rows[0];
  }
  async created(citaId){
    const cita=await this.details(citaId); if(!cita)return;
    await citaQueue.add('calendar-sync',{citaId},{jobId:`calendar-sync:${citaId}:${Date.now()}`});
    await emailQueue.add('cita-evento',{tipo:'creada',citaId});
    await notifQueue.add('whatsapp',{to:cita.whatsapp||cita.telefono,mensaje:`Tu cita fue creada para el ${this.date(cita.fecha)} a las ${String(cita.hora_inicio).slice(0,5)} (${cita.modalidad}).`,citaId,userId:cita.paciente_id,tipo:'cita_creada'});
    await this.scheduleReminder(cita);
  }
  async rescheduled(citaId){
    const cita=await this.details(citaId); if(!cita)return;
    await citaQueue.add('calendar-sync',{citaId});
    await emailQueue.add('cita-evento',{tipo:'reprogramada',citaId});
    await this.scheduleReminder(cita);
  }
  async cancelled(citaId){
    await citaQueue.add('calendar-cancel',{citaId});
    await emailQueue.add('cita-evento',{tipo:'cancelada',citaId});
  }
  async scheduleReminder(cita){
    await db.query('UPDATE app.citas SET recordatorio_24h=false WHERE id=$1',[cita.id]);
    const date=this.date(cita.fecha),time=String(cita.hora_inicio).slice(0,8);
    const due=new Date(`${date}T${time}-05:00`).getTime()-24*3600*1000;
    await citaQueue.add('recordatorio-cita',{citaId:cita.id},{delay:Math.max(0,due-Date.now()),attempts:3,backoff:{type:'exponential',delay:5000},jobId:`reminder:${cita.id}:${date}:${time}`});
  }
}
module.exports=new AppointmentAutomationService();
