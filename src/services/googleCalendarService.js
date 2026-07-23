const crypto = require('crypto');
const logger = require('../config/logger');

class GoogleCalendarService {
  constructor(fetchImpl = fetch) { this.fetch = fetchImpl; }
  configured() { return Boolean(process.env.GOOGLE_CALENDAR_ID && process.env.GOOGLE_SERVICE_ACCOUNT_JSON); }
  credentials() {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    try { return JSON.parse(raw); } catch { return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); }
  }
  encode(value) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
  async token() {
    const c = this.credentials(), now = Math.floor(Date.now() / 1000);
    const unsigned = `${this.encode({ alg:'RS256', typ:'JWT' })}.${this.encode({
      iss:c.client_email, scope:'https://www.googleapis.com/auth/calendar', aud:c.token_uri || 'https://oauth2.googleapis.com/token',
      iat:now, exp:now + 3600,
    })}`;
    const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), c.private_key).toString('base64url');
    const body = new URLSearchParams({ grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion:`${unsigned}.${signature}` });
    const response = await this.fetch(c.token_uri || 'https://oauth2.googleapis.com/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body });
    if (!response.ok) throw new Error(`Google OAuth respondió ${response.status}`);
    return (await response.json()).access_token;
  }
  event(cita) {
    const date = cita.fecha instanceof Date ? cita.fecha.toISOString().slice(0,10) : String(cita.fecha).slice(0,10);
    const tz = process.env.APP_TIMEZONE || 'America/Bogota';
    return {
      summary:`Sesión psicológica - ${cita.paciente_nombre} ${cita.paciente_apellido}`,
      description:`Modalidad: ${cita.modalidad}. Código interno: ${cita.id}`,
      start:{dateTime:`${date}T${String(cita.hora_inicio).slice(0,8)}`,timeZone:tz},
      end:{dateTime:`${date}T${String(cita.hora_fin).slice(0,8)}`,timeZone:tz},
      attendees: process.env.GOOGLE_CALENDAR_INVITE_PATIENT === 'true' ? [{email:cita.email}] : undefined,
      reminders:{useDefault:false,overrides:[{method:'email',minutes:1440},{method:'popup',minutes:30}]},
    };
  }
  async sync(cita) {
    if (!this.configured()) return { skipped:'Google Calendar no configurado' };
    const token = await this.token(), calendar = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID);
    const base = `https://www.googleapis.com/calendar/v3/calendars/${calendar}/events`;
    const method = cita.google_event_id ? 'PUT' : 'POST';
    const url = cita.google_event_id ? `${base}/${encodeURIComponent(cita.google_event_id)}?sendUpdates=all` : `${base}?sendUpdates=all`;
    const response = await this.fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(this.event(cita))});
    if(!response.ok) throw new Error(`Google Calendar respondió ${response.status}: ${await response.text()}`);
    const data=await response.json(); logger.info(`Google Calendar sincronizado: ${cita.id}`);
    return {eventId:data.id,htmlLink:data.htmlLink};
  }
  async cancel(eventId) {
    if (!this.configured() || !eventId) return {skipped:true};
    const token=await this.token(), calendar=encodeURIComponent(process.env.GOOGLE_CALENDAR_ID);
    const response=await this.fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendar}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}});
    if(!response.ok && response.status!==404 && response.status!==410) throw new Error(`Google Calendar respondió ${response.status}`);
    return {cancelled:true};
  }
}
module.exports = new GoogleCalendarService();
