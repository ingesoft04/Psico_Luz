# 🧠❤️ Psicóloga Luz Adriana — Backend API

> Stack: **Node.js · PostgreSQL · Redis · Docker · N8N · Claude AI · Gemini**

## Manual completo

Consulte [MANUAL_INSTALACION_Y_USO.md](MANUAL_INSTALACION_Y_USO.md) para instalación en
Windows/Linux, configuración de `.env`, SMTP, dominio, HTTPS, operación por roles,
documentos clínicos, respaldos, restauración, actualización y diagnóstico.

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│  Internet / Clientes                                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
              ┌────────▼────────┐
              │   NGINX (80/443) │  ← Reverse proxy + SSL + Rate limit
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │  Node.js API    │  ← Express · JWT · Bull queues
              │  (puerto 4000)  │
              └────┬────────┬───┘
                   │        │
        ┌──────────▼──┐  ┌──▼──────────┐
        │ PostgreSQL  │  │   Redis 7   │
        │ (puerto 5432│  │ (puerto 6379│
        │ 6 schemas)  │  │ cache+jobs) │
        └─────────────┘  └─────────────┘
                   │
        ┌──────────▼──────────┐
        │   N8N (puerto 5678) │  ← Automatización Claude+Gemini+Webhooks
        └─────────────────────┘
```

---

## 🚀 Inicio rápido

### 1. Clonar y configurar variables
```bash
git clone <repo>
cd psicologa-backend
cp .env.example .env
# Editar .env con tus credenciales
nano .env
```

### 2. Levantar todo con Docker
```bash
# Solo la app (API + Postgres + Redis + Nginx)
docker-compose up -d

# Con herramientas de administración (pgAdmin + Redis Commander)
docker-compose --profile tools up -d

# Con N8N para automatización
docker-compose --profile automation up -d

# Todo junto
docker-compose --profile tools --profile automation up -d
```

### 3. Verificar que funciona
```bash
curl http://localhost/health
# → {"status":"healthy","checks":{"postgres":"ok","redis":"ok"}}
```

### 4. Ver logs en tiempo real
```bash
docker-compose logs -f api
```

---

## 📡 Endpoints API

Base URL: `http://localhost/api/v1`

### 🔐 Autenticación
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/auth/register` | Registrar nuevo usuario |
| POST | `/auth/login` | Iniciar sesión → retorna JWT |
| POST | `/auth/refresh` | Renovar access token |
| POST | `/auth/logout` | Cerrar sesión (blacklist token) |
| POST | `/auth/forgot-password` | Solicitar reset de contraseña |
| POST | `/auth/reset-password` | Resetear contraseña con token |
| GET  | `/auth/me` | Perfil del usuario autenticado |

### 📅 Citas
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET  | `/citas` | Listar citas (filtros: estado, desde, hasta, page) |
| GET  | `/citas/hoy` | Citas del día (admin/psicóloga) |
| GET  | `/citas/:id` | Detalle de cita |
| POST | `/citas` | Agendar nueva cita |
| PUT  | `/citas/:id` | Actualizar cita |
| PATCH | `/citas/:id/estado` | Cambiar estado |
| DELETE | `/citas/:id` | Cancelar cita |

### 🗓️ Disponibilidad
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/disponibilidad` | Horarios disponibles por día |
| GET | `/disponibilidad/slots?fecha=2025-12-01&modalidad=virtual` | Slots libres para una fecha |

### 🧠 Inteligencia Artificial
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/ai/chat` | Chat de apoyo emocional 24/7 (Claude) |
| POST | `/ai/recordatorio/:citaId` | Generar recordatorio personalizado |
| POST | `/ai/resumen/:citaId` | Resumen automático de sesión |
| POST | `/ai/bienestar/:pacienteId` | Análisis de bienestar del paciente |
| POST | `/ai/clasificar` | Clasificar motivo de consulta (Gemini) |
| GET  | `/ai/log` | Historial de llamadas IA (admin) |
| GET  | `/ai/log/costos` | Reporte de costos por proveedor |
| GET  | `/ai/plantillas` | Plantillas de prompts |
| POST | `/ai/plantillas` | Crear plantilla |
| PUT  | `/ai/plantillas/:id` | Actualizar plantilla |

### 🔌 Webhooks (para N8N)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/webhooks/n8n` | Recibir eventos de N8N |
| POST | `/webhooks/whatsapp` | Recibir mensajes WhatsApp (Twilio) |
| POST | `/webhooks/pago` | Notificaciones de pago (Wompi/Stripe) |
| GET  | `/webhooks/ping` | Health check para N8N |

### 📊 Admin
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/admin/dashboard` | Métricas generales (cacheado 60s) |
| GET | `/admin/reportes/citas` | Reporte citas por mes |
| GET | `/admin/reportes/ingresos` | Reporte ingresos por mes |
| GET | `/admin/fichas/:pacienteId` | Ficha clínica del paciente |
| POST | `/admin/fichas/:pacienteId` | Crear/actualizar ficha clínica |

---

## 🤖 Automatización con N8N

### Acceder a N8N
```
http://localhost:5678
Usuario: admin
Password: (ver .env → N8N_PASSWORD)
```

### Eventos disponibles para flujos N8N
Enviar POST a `/api/v1/webhooks/n8n` con header `X-N8N-Signature`:

```json
{ "evento": "generar_recordatorio",  "payload": { "citaId": "uuid" } }
{ "evento": "nuevo_paciente_bienvenida", "payload": { "nombre": "...", "whatsapp": "...", "userId": "uuid" } }
{ "evento": "clasificar_motivo",     "payload": { "motivo": "texto del motivo" } }
{ "evento": "cita_confirmada",       "payload": { "citaId": "uuid" } }
{ "evento": "analisis_semanal",      "payload": {} }
```

### Flujos sugeridos en N8N
1. **Bienvenida automática** → Trigger: webhook nuevo usuario → Claude genera mensaje → WhatsApp
2. **Recordatorio inteligente** → Cron diario 8am → Consulta citas del día siguiente → Claude personaliza → WhatsApp + Email
3. **Post-sesión** → Trigger: estado cita = completada → Gemini clasifica → Claude resume → Guarda en DB
4. **Seguimiento semanal** → Cron lunes → Analizar pacientes activos → Claude analiza bienestar → Reporte PDF

---

## 🗄️ Base de Datos — Schemas

| Schema | Descripción |
|--------|-------------|
| `app`  | Tablas principales: usuarios, citas, fichas, pagos, notas, notificaciones |
| `ai`   | Log de interacciones IA y plantillas de prompts |
| `audit`| Registro automático de cambios en tablas críticas |
| `n8n`  | Usado internamente por N8N para sus flujos |

### Tablas principales
- `app.usuarios` — Pacientes, admin, psicóloga, recepcionista
- `app.citas` — Agendamiento con estados y metadata
- `app.fichas_clinicas` — Historia clínica por paciente
- `app.notas_sesion` — Notas privadas por sesión (con resumen IA)
- `app.pagos` — Registro de pagos y estado
- `app.disponibilidad` — Horarios de la psicóloga
- `app.notificaciones` — Notificaciones multi-canal
- `ai.interacciones` — Log de cada llamada a Claude/Gemini con tokens y costo
- `ai.plantillas_prompt` — Prompts reutilizables y versionados

---

## ⚡ Redis — Qué se cachea

| Clave | TTL | Descripción |
|-------|-----|-------------|
| `user:{id}` | 30 min | Datos del usuario autenticado |
| `citas:lista:*` | 5 min | Listado de citas paginado |
| `citas:det:{id}` | 30 min | Detalle de cita individual |
| `citas:hoy:{fecha}` | 2 min | Citas del día de hoy |
| `slots:{fecha}:{modal}` | 5 min | Slots disponibles para agendar |
| `ai:recordatorio:{id}` | 1 hora | Recordatorio generado por Claude |
| `ai:chat:{sessionId}` | 7 días | Historial de chat por sesión |
| `admin:dashboard` | 1 min | Métricas del dashboard |
| `blacklist:{token}` | 7 días | Access tokens revocados (logout) |
| `refresh:{userId}` | 30 días | Refresh tokens activos |
| `rl:api:*` | 15 min | Rate limiting global |
| `rl:auth:*` | 15 min | Rate limiting autenticación |

---

## 🔐 Seguridad

- ✅ JWT con access token (7d) + refresh token (30d)
- ✅ Blacklist de tokens en Redis (logout)
- ✅ bcrypt con 12 rounds
- ✅ Rate limiting por IP en Redis
- ✅ Helmet (14 headers de seguridad HTTP)
- ✅ CORS configurado por dominio
- ✅ Validación de entrada con express-validator + zod
- ✅ RBAC (paciente / recepcionista / psicóloga / admin)
- ✅ Audit log automático en PostgreSQL
- ✅ Usuario no-root en Docker
- ✅ Firma HMAC para webhooks N8N
- ✅ Nginx como reverse proxy (oculta Node.js)

---

## 🛠️ Herramientas de administración

| Herramienta | URL | Acceso |
|-------------|-----|--------|
| pgAdmin (PostgreSQL UI) | http://localhost:5050 | `.env PGADMIN_*` |
| Redis Commander | http://localhost:8081 | admin / (ver .env) |
| N8N Automation | http://localhost:5678 | `.env N8N_*` |
| API Health | http://localhost/health | público |
| API Docs | http://localhost/api/v1/docs | público |

---

## 📁 Estructura del proyecto

```
psicologa-backend/
├── docker-compose.yml          ← Todos los servicios
├── Dockerfile                  ← Multi-stage build
├── .env.example                ← Variables de entorno (copiar a .env)
├── package.json
├── nginx/
│   ├── nginx.conf
│   └── conf.d/
│       ├── api.conf            ← Server block + rate limiting
│       └── proxy_params.conf
├── scripts/
│   └── init.sql                ← Schema completo de PostgreSQL
├── logs/                       ← Logs de app y nginx (auto-creado)
├── uploads/                    ← Archivos subidos (auto-creado)
└── src/
    ├── server.js               ← Entry point
    ├── app.js                  ← Express config + rutas
    ├── config/
    │   ├── database.js         ← Pool PostgreSQL
    │   ├── redis.js            ← Cliente Redis + helpers
    │   └── logger.js           ← Winston
    ├── middleware/
    │   ├── auth.js             ← JWT + RBAC
    │   ├── errorHandler.js     ← Error global + 404
    │   └── rateLimiter.js      ← Rate limit con Redis
    ├── routes/
    │   ├── auth.js             ← /auth/*
    │   ├── usuarios.js         ← /usuarios/* + /disponibilidad/* + ...
    │   ├── citas.js            ← /citas/*
    │   ├── ai.js               ← /ai/*
    │   └── webhooks.js         ← /webhooks/* (N8N + WhatsApp + pagos)
    ├── controllers/
    │   ├── authController.js   ← register, login, logout, refresh
    │   ├── citasController.js  ← CRUD citas + cache Redis
    │   └── aiController.js     ← Claude, Gemini, plantillas
    ├── services/
    │   └── aiService.js        ← Claude + Gemini + log IA
    ├── jobs/
    │   └── queues.js           ← Bull: recordatorios, IA, WhatsApp, email
    └── utils/
        └── AppError.js         ← Error personalizado
```

---

## 🔮 Próximos pasos (roadmap)

- [ ] Módulo de videollamadas integrado (Jitsi / Daily.co)
- [ ] Dashboard en tiempo real con WebSockets
- [ ] App móvil React Native
- [ ] Integración con Wompi para pagos en línea Colombia
- [ ] Flujos N8N pre-construidos para importar
- [ ] Tests E2E con Jest + Supertest
- [ ] CI/CD con GitHub Actions
- [ ] Certificado SSL automático con Let's Encrypt + Certbot

---

*Hecho con 💚 para el bienestar mental de Colombia 🇨🇴*
