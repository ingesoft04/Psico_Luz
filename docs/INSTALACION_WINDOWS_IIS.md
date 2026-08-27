# Instalación en Windows Server con IIS

IIS publica el frontend bajo `/psicologia` y Application Request Routing (ARR)
envía `/api` y `/health` a Node.js en `127.0.0.1:4000`. PostgreSQL, Redis y Node
no deben exponerse directamente a Internet.

## 1. Requisitos

- Windows Server 2022 o 2025 actualizado.
- IIS con Static Content, HTTP Logging y Management Console.
- IIS URL Rewrite 2 y ARR. En **IIS Manager > servidor > Application Request
  Routing Cache > Server Proxy Settings**, active `Enable Proxy`.
- Node.js 22 LTS, Git y Corepack.
- PostgreSQL 16 o superior como servicio de Windows.
- Redis 7 compatible. Redis Open Source no ofrece servicio nativo oficial para
  Windows: use Redis en WSL2, un servicio administrado o una distribución
  compatible soportada; no use ports antiguos abandonados.
- Certificado TLS válido para el dominio.

Use una cuenta limitada para Node. Solo necesita lectura del proyecto y escritura
en `logs` y `uploads`.

## 2. Instalar la aplicación

En PowerShell administrativo:

```powershell
New-Item -ItemType Directory -Path C:\Apps\PsicoLuz
Set-Location C:\Apps\PsicoLuz
git clone https://github.com/ingesoft04/Psico_Luz.git .
git switch main
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --prod --frozen-lockfile
Copy-Item .env.example .env
New-Item -ItemType Directory -Force logs, uploads
```

Para `https://ejemplo.com/psicologia`, configure como mínimo:

```dotenv
NODE_ENV=production
PORT=4000
APP_URL=https://ejemplo.com/psicologia
FRONTEND_URL=https://ejemplo.com/psicologia
PUBLIC_BASE_PATH=/psicologia
DB_HOST=127.0.0.1
DB_PORT=5432
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

Complete todos los valores obligatorios vacíos. Cada secreto debe ser único y de
al menos 32 caracteres. Restrinja `.env` y sustituya `SYSTEM` si Node usa otra
identidad:

```powershell
icacls .env /inheritance:r
icacls .env /grant:r "Administrators:F" "NT AUTHORITY\SYSTEM:R"
```

## 3. Inicializar PostgreSQL

Cree `psicologa_user` y `psicologa_db` con pgAdmin o `psql`, sin escribir la
contraseña en el historial. Aplique el esquema:

```powershell
$env:PGPASSWORD = Read-Host "Contraseña PostgreSQL"
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" `
  -h 127.0.0.1 -U psicologa_user -d psicologa_db `
  -v ON_ERROR_STOP=1 -f scripts\init.sql
Remove-Item Env:PGPASSWORD
```

La API aplica las migraciones restantes al arrancar. PostgreSQL y Redis deben
escuchar únicamente en loopback o en una red privada controlada.

## 4. Arranque automático de Node.js

Pruebe primero:

```powershell
pnpm start
Invoke-RestMethod http://127.0.0.1:4000/health
```

Después cree una tarea en **Task Scheduler**:

- Nombre: `PsicoLuz API`.
- Ejecutar aunque la cuenta limitada no haya iniciado sesión.
- Trigger: inicio del sistema con 60 segundos de retraso.
- Programa: `C:\Program Files\nodejs\node.exe`.
- Argumentos: `C:\Apps\PsicoLuz\src\server.js`.
- Iniciar en: `C:\Apps\PsicoLuz`.
- Reiniciar cada minuto si falla.

No abra el puerto 4000 en Windows Firewall.

## 5. Publicar con IIS

1. Cree `C:\inetpub\PsicoLuz`.
2. Copie solamente `psicologa-luz-adriana.html` como `index.html`, `agenda.html`,
   `panel.html`, `sesion-clinica.html`, `manifest.webmanifest`, `icon.svg` y
   `sw.js`.
3. Cree una aplicación IIS `psicologia` bajo el sitio HTTPS y apúntela a ese
   directorio. Conceda solo lectura a `IIS_IUSRS`.
4. No copie `.env`, `.git`, `src`, logs, uploads ni respaldos al sitio.
5. Añada este `web.config`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="API" stopProcessing="true">
          <match url="^api/(.*)$" />
          <action type="Rewrite" url="http://127.0.0.1:4000/api/{R:1}" />
        </rule>
        <rule name="Health" stopProcessing="true">
          <match url="^health$" />
          <action type="Rewrite" url="http://127.0.0.1:4000/health" />
        </rule>
        <rule name="Frontend" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="index.html" />
        </rule>
      </rules>
    </rewrite>
    <staticContent>
      <remove fileExtension=".webmanifest" />
      <mimeMap fileExtension=".webmanifest" mimeType="application/manifest+json" />
    </staticContent>
    <directoryBrowse enabled="false" />
    <httpProtocol>
      <customHeaders>
        <add name="X-Content-Type-Options" value="nosniff" />
        <add name="Referrer-Policy" value="no-referrer" />
        <add name="Permissions-Policy" value="camera=(), microphone=(), geolocation=()" />
      </customHeaders>
    </httpProtocol>
  </system.webServer>
</configuration>
```

Mantenga únicamente el binding HTTPS y redirija HTTP a HTTPS.

## 6. Verificación, actualización y reversión

```powershell
Invoke-RestMethod http://127.0.0.1:4000/health
Invoke-WebRequest https://ejemplo.com/psicologia/health
Invoke-WebRequest https://ejemplo.com/psicologia/
Invoke-WebRequest https://ejemplo.com/psicologia/manifest.webmanifest
```

Confirme en navegador que agenda y panel conservan `/psicologia`, una API
protegida responde 401 sin token y no son públicos `.env`, logs ni puertos
internos.

Antes de actualizar, haga `pg_dump`, respalde `.env`, los siete archivos públicos
y la revisión instalada. Prepare la nueva revisión en otro directorio con
`pnpm install --frozen-lockfile`, ejecute `pnpm lint` y `pnpm test`, y finalmente
use `pnpm prune --prod`. Detenga la tarea, cambie la versión, actualice el
frontend y vuelva a iniciarla. Si una comprobación falla,
restaure la revisión y archivos anteriores; restaure PostgreSQL solo cuando sea
necesario y tras evaluar los datos creados después del respaldo.

Referencias oficiales: [proxy inverso con ARR y URL Rewrite](https://learn.microsoft.com/en-us/iis/extensions/url-rewrite-module/reverse-proxy-with-url-rewrite-v2-and-application-request-routing),
[WSL en Windows Server](https://learn.microsoft.com/en-us/windows/wsl/install-on-server) e
[instalación de Redis](https://redis.io/docs/latest/operate/oss_and_stack/install/).
