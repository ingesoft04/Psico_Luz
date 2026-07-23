# Configuración de automatizaciones

La aplicación automatiza estos eventos:

| Evento | Google Calendar | Correo | WhatsApp |
|---|---:|---:|---:|
| Cita creada | Crear evento | Confirmación | Confirmación |
| Cita reprogramada | Actualizar evento | Aviso | — |
| Cita cancelada | Eliminar evento | Aviso | — |
| 24 horas antes | Recordatorio del evento | Recordatorio | Recordatorio |

Las tareas se procesan con Bull y Redis. Si un proveedor externo falla, la cita permanece guardada y la tarea se reintenta.

## Google Calendar

1. Cree un proyecto en Google Cloud.
2. Habilite Google Calendar API.
3. Cree una cuenta de servicio y descargue su JSON.
4. Abra el calendario de la psicóloga y compártalo con el correo `client_email` de la cuenta de servicio con permiso para modificar eventos.
5. Obtenga el ID del calendario en `Configuración e integración`.
6. Configure:

```env
GOOGLE_CALENDAR_ID=identificador_del_calendario
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
GOOGLE_CALENDAR_INVITE_PATIENT=false
APP_TIMEZONE=America/Bogota
```

El JSON también puede codificarse completo en Base64 para evitar problemas de comillas.

`GOOGLE_CALENDAR_INVITE_PATIENT=false` evita que Google envíe invitaciones adicionales. Los correos propios del sistema seguirán funcionando.

## WhatsApp con Twilio

Configure:

```env
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+...
```

En Twilio configure el webhook de mensajes entrantes:

```text
POST https://DOMINIO/api/v1/webhooks/whatsapp
```

El número de WhatsApp del paciente debe coincidir con el registrado. Comandos:

- `AGENDAR`
- `MIS CITAS`
- `CANCELAR CITA`
- `AYUDA`
- `SALIR`

El agendamiento pregunta fecha, modalidad y muestra únicamente espacios disponibles.

## Telegram

1. Cree el bot con BotFather.
2. Configure:

```env
TELEGRAM_BOT_TOKEN=token_del_bot
TELEGRAM_WEBHOOK_SECRET=secreto_aleatorio
```

3. Registre el webhook:

```text
https://api.telegram.org/botTOKEN/setWebhook?url=https://DOMINIO/api/v1/webhooks/telegram&secret_token=SECRETO
```

4. Obtenga el `chat_id` del paciente y vincúlelo mediante el endpoint de superadministración:

```http
PUT /api/v1/maintenance/usuarios/UUID/telegram
Authorization: Bearer TOKEN_SUPERADMIN
Content-Type: application/json

{"chat_id":"123456789"}
```

Esta vinculación administrativa evita apropiaciones de cuentas indicando solamente un correo.

## Chat web

El sitio público incluye un botón `Asistente`. Responde preguntas frecuentes sobre:

- Agenda.
- Horarios.
- Sesiones virtuales.
- Ubicación.
- Precio informativo.

Para agendar o cancelar dirige al espacio autenticado, protegiendo la identidad del paciente.

Personalice:

```env
SESSION_PRICE_TEXT="Valor informativo"
OFFICE_ADDRESS="Dirección del consultorio"
```

## Aplicar cambios

```powershell
docker compose up -d --build api nginx
docker compose logs -f api
```

Revise las tareas Bull y los logs después de hacer una cita de prueba. Use un calendario y correos de prueba antes de conectar cuentas reales.
