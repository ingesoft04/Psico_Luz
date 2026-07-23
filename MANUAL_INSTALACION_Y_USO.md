# Manual de instalación y uso

## Psicóloga Luz Adriana

Versión del manual: 1.0  
Plataforma: Windows o Linux con Docker  
Componentes: Nginx, Node.js, PostgreSQL, Redis, agenda, panel clínico y panel de mantenimiento.

---

## 1. Objetivo

Este manual explica cómo instalar, configurar, operar, respaldar y actualizar la plataforma. Incluye:

- Sitio público.
- Registro e inicio de sesión de pacientes.
- Consulta de disponibilidad y agendamiento.
- Panel de la psicóloga.
- Registro, firma, protección, exportación y envío de informes clínicos.
- Panel del superadministrador de mantenimiento.
- PostgreSQL, Redis, SMTP, dominio y HTTPS.

La configuración de Google Calendar, WhatsApp, Telegram y el asistente web está detallada
en [AUTOMATIZACION.md](AUTOMATIZACION.md).

## 2. Requisitos

### Equipo local o servidor

- Procesador de 2 núcleos o más.
- 4 GB de RAM como mínimo; 8 GB recomendados.
- 10 GB de espacio libre, más el espacio requerido para respaldos.
- Windows 10/11 con Docker Desktop, o Linux con Docker Engine y Docker Compose.
- Acceso a los puertos `80` y `443` en producción.

No es obligatorio instalar Node.js, PostgreSQL ni Redis directamente: Docker los proporciona.

### Verificación

```powershell
docker --version
docker compose version
```

## 3. Estructura principal

```text
Psico_Luz/
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .env                         # privado; no subir a Git
├── panel.html
├── agenda.html
├── sesion-clinica.html
├── nginx/
├── scripts/
├── src/
├── tests/
├── logs/
├── uploads/
└── backups/
```

## 4. Instalación local

### 4.1 Preparar la configuración

Desde PowerShell:

```powershell
Set-Location C:\Personal\Psico_Luz
Copy-Item .env.example .env
notepad .env
```

Cambie como mínimo:

```env
POSTGRES_PASSWORD=una_clave_larga_y_unica
REDIS_PASSWORD=otra_clave_larga_y_unica
JWT_SECRET=secreto_aleatorio_de_al_menos_64_caracteres
JWT_REFRESH_SECRET=otro_secreto_aleatorio_diferente
CLINICAL_SIGNING_SECRET=secreto_exclusivo_para_documentos_clinicos

PSYCHOLOGIST_EMAIL=psicologa@dominio.com
PSYCHOLOGIST_PASSWORD=clave_segura_para_psicologa
MAINTENANCE_EMAIL=mantenimiento@dominio.com
MAINTENANCE_PASSWORD=clave_segura_para_mantenimiento
```

Cada secreto debe ser diferente. No utilice los valores de ejemplo en producción.

### 4.2 Iniciar la plataforma

```powershell
docker compose up -d --build
```

Verificar:

```powershell
docker compose ps
Invoke-WebRequest http://localhost:8180/health
```

El resultado de salud debe indicar PostgreSQL y Redis en estado `ok`.

### 4.3 Direcciones locales

| Función | Dirección |
|---|---|
| Sitio público | `http://localhost:8180` |
| Agenda de pacientes | `http://localhost:8180/agenda.html` |
| Panel operativo | `http://localhost:8180/panel.html` |
| Salud del sistema | `http://localhost:8180/health` |
| API | `http://localhost:8180/api/v1` |

## 5. Configuración del correo SMTP

El SMTP permite enviar recordatorios y documentos clínicos protegidos.

### Gmail

Active verificación en dos pasos y genere una contraseña de aplicación:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=correo@gmail.com
SMTP_PASS=contraseña_de_aplicacion
EMAIL_FROM="Psicóloga Luz Adriana <correo@gmail.com>"
```

### Microsoft 365

```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=correo@dominio.com
SMTP_PASS=contraseña_o_secreto_smtp
EMAIL_FROM="Psicóloga Luz Adriana <correo@dominio.com>"
```

Después de modificar `.env`:

```powershell
docker compose up -d --force-recreate api
```

El documento clínico solamente puede enviarse después de estar firmado y protegido. Verifique cuidadosamente el destinatario antes de confirmar.

## 6. Dominio y publicación

Suponga que el dominio comprado es `psicologaluz.com`.

### 6.1 DNS

En el proveedor del dominio cree:

| Tipo | Nombre | Destino |
|---|---|---|
| A | `@` | IP pública del servidor |
| A | `www` | IP pública del servidor |

Opcionalmente:

| Tipo | Nombre | Destino |
|---|---|---|
| A | `panel` | IP pública del servidor |
| A | `agenda` | IP pública del servidor |

La propagación DNS puede tardar varias horas.

### 6.2 Variables

```env
DOMAIN=psicologaluz.com
APP_URL=https://psicologaluz.com
FRONTEND_URL=https://psicologaluz.com
HTTP_PORT=80
```

### 6.3 Nginx

En `nginx/conf.d/api.conf` cambie:

```nginx
server_name _;
```

por:

```nginx
server_name psicologaluz.com www.psicologaluz.com;
```

### 6.4 HTTPS

No publique datos clínicos únicamente con HTTP. Instale un certificado de Let's Encrypt o use un proxy que gestione TLS. Los puertos `80` y `443` deben estar permitidos en el firewall.

Después de instalar HTTPS, confirme que:

- `https://psicologaluz.com/health` responde correctamente.
- El certificado corresponde al dominio.
- `APP_URL` y `FRONTEND_URL` usan `https://`.
- No existen advertencias de contenido inseguro.

## 7. Uso por pacientes

### Crear cuenta

1. Abra la agenda.
2. Seleccione registro.
3. Ingrese nombre, apellido, correo, teléfono y contraseña.
4. Inicie sesión.

### Agendar una cita

1. Seleccione fecha y modalidad.
2. Consulte la disponibilidad.
3. Seleccione una hora.
4. Registre el motivo y acepte el consentimiento cuando corresponda.
5. Confirme la cita.

La cita aparecerá en `Mis próximas citas`. Desde allí puede descargar el evento de calendario o cancelar según las reglas configuradas.

## 8. Uso del panel de la psicóloga

Abra `/panel.html` e ingrese con la cuenta `PSYCHOLOGIST_EMAIL`.

### Agenda

En la columna de registro:

- `✕` roja: la sesión no tiene registro.
- `✓` verde: el registro fue diligenciado.

`Registrar sesión` abre una pestaña clínica independiente. El navegador debe permitir ventanas emergentes para el dominio.

### Registro clínico

La pantalla muestra:

- Paciente.
- Fecha y hora de inicio.
- Registro de atención.
- Estado emocional.
- Progreso.
- Tareas acordadas.
- Próximos pasos.

Flujo obligatorio:

```text
Guardar borrador → Firmar → Proteger → Exportar PDF o enviar
```

#### Guardar borrador

Permite continuar editando. El registro de atención es obligatorio.

#### Firmar

Genera la huella SHA-256 y el sello HMAC-SHA256. Una nota firmada queda inmutable.

#### Proteger

Verifica que el contenido no haya cambiado y registra la protección SGSI.

#### Exportar PDF

Solo está disponible para documentos firmados y protegidos. El PDF incluye clasificación confidencial, sello, huella, profesional, paciente y código documental.

#### Enviar por correo

Solo se permite para un documento protegido. Confirme el destinatario antes del envío. El correo contiene información sensible.

## 9. Uso del superadministrador

Ingrese al panel con `MAINTENANCE_EMAIL`. Su rol es `superadmin`.

Puede:

- Crear usuarios.
- Editar nombre, apellido, correo, rol, contraseña y estado.
- Bloquear o activar cuentas.
- Eliminar lógicamente cuentas.
- Consultar salud técnica, auditoría y migraciones.

No puede leer registros clínicos. Esta separación evita que el personal técnico tenga acceso injustificado a información de pacientes.

La eliminación de usuarios es lógica para conservar trazabilidad. No elimine datos directamente en PostgreSQL salvo que exista un procedimiento formal autorizado.

## 10. Perfiles opcionales

### Herramientas administrativas

```powershell
docker compose --profile tools up -d
```

- pgAdmin: `http://localhost:5050`
- Redis Commander: `http://localhost:8081`

No exponga estas herramientas directamente a Internet.

### N8N

```powershell
docker compose --profile automation up -d
```

Acceso: `http://localhost:5678`

Cambie `N8N_USER`, `N8N_PASSWORD` y `N8N_WEBHOOK_SECRET` antes de usarlo.

### Respaldos automáticos

```powershell
docker compose --profile backup up -d
```

Se crea un archivo diario en `backups/`. La retención predeterminada es de 14 días y puede cambiarse:

```env
BACKUP_RETENTION_DAYS=30
```

## 11. Restauración de respaldo

Antes de restaurar:

1. Haga una copia del respaldo actual.
2. Detenga el acceso de usuarios.
3. Identifique exactamente el archivo `.dump`.
4. Pruebe la restauración primero en un entorno separado.

Ejemplo:

```powershell
docker compose stop api nginx
docker cp .\backups\psico_luz_FECHA.dump psicologa_postgres:/tmp/restauracion.dump
docker exec psicologa_postgres pg_restore -U psicologa_user -d psicologa_db --clean --if-exists /tmp/restauracion.dump
docker compose start api nginx
```

La restauración puede reemplazar información. Debe realizarla personal autorizado.

## 12. Actualización

Antes de actualizar:

```powershell
docker compose --profile backup up -d
docker compose ps
```

Después de actualizar los archivos:

```powershell
docker compose up -d --build
docker compose logs --tail=100 api
Invoke-WebRequest http://localhost:8180/health
```

Las migraciones de base de datos se ejecutan automáticamente al iniciar la API.

## 13. Pruebas

Si Node.js está instalado localmente:

```powershell
npm test
npm run test:integration
```

Sin Node.js local, ejecute dentro del contenedor:

```powershell
docker exec psicologa_api sh -c "node --test tests/unit/*.test.js"
docker exec -e TEST_BASE_URL=http://psicologa_nginx psicologa_api node --test --test-concurrency=1 tests/integration.test.js
```

## 14. Logs y diagnóstico

```powershell
docker compose ps
docker compose logs --tail=200 api
docker compose logs --tail=200 nginx
docker compose logs --tail=200 postgres
docker compose logs --tail=200 redis
```

### “Demasiadas peticiones”

Revise los límites de Nginx y Express. No aumente los límites sin analizar tráfico anormal o intentos de fuerza bruta.

### La sesión clínica vuelve al login

1. Recargue el panel con `Ctrl + F5`.
2. Inicie sesión nuevamente.
3. Permita ventanas emergentes.
4. No abra directamente `sesion-clinica.html`; acceda desde la agenda del panel.

### El correo no se envía

Revise:

- Credenciales SMTP.
- Contraseña de aplicación.
- Puerto `587`.
- Salida a Internet del servidor.
- Logs de la API.

### PostgreSQL o Redis no están disponibles

```powershell
docker compose restart postgres redis api
docker compose ps
```

## 15. Seguridad y SGSI

- No almacene secretos en el repositorio.
- Proteja `.env` con permisos restringidos.
- Use HTTPS en producción.
- Utilice contraseñas únicas y autenticación multifactor en correo, dominio y servidor.
- Restrinja pgAdmin, Redis Commander y N8N mediante VPN o firewall.
- Realice respaldos cifrados y pruebe su restauración.
- Revise periódicamente accesos clínicos y cambios administrativos.
- No envíe documentos clínicos sin autorización y verificación del destinatario.
- Rote JWT, SMTP y `CLINICAL_SIGNING_SECRET` mediante un procedimiento controlado.
- Conserve evidencia de incidentes y cambios.

Cambiar `CLINICAL_SIGNING_SECRET` impide verificar con la nueva clave los documentos sellados anteriormente. La rotación debe manejar versiones de clave y conservar de forma segura las claves históricas.

## 16. Puesta en producción

Lista mínima:

- [ ] Dominio apuntando al servidor.
- [ ] HTTPS válido.
- [ ] Secretos de desarrollo reemplazados.
- [ ] SMTP probado.
- [ ] Contraseñas operativas cambiadas.
- [ ] Firewall activo.
- [ ] Herramientas administrativas no expuestas públicamente.
- [ ] Respaldos automáticos habilitados.
- [ ] Restauración probada.
- [ ] Pruebas unitarias e integración aprobadas.
- [ ] Aviso de privacidad y consentimiento revisados legalmente.
- [ ] Procedimientos SGSI documentados.

## 17. Comandos rápidos

```powershell
# Iniciar
docker compose up -d

# Reconstruir
docker compose up -d --build

# Estado
docker compose ps

# Logs
docker compose logs -f api

# Reiniciar
docker compose restart api nginx

# Detener sin borrar datos
docker compose stop

# Volver a iniciar
docker compose start
```

Evite `docker compose down -v` porque elimina los volúmenes persistentes y puede destruir la base de datos.
