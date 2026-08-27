# Instalación nativa en Ubuntu/Linux

Esta modalidad ejecuta PostgreSQL, Redis, Node.js y Nginx como servicios del
sistema, sin Docker. Los ejemplos usan Ubuntu Server 24.04 LTS y
`https://ejemplo.com/psicologia/`.

## 1. Preparar el servidor

Use acceso SSH con llave y un usuario administrativo distinto de la cuenta de la
aplicación:

```bash
sudo apt update
sudo apt full-upgrade
sudo apt install -y git postgresql redis-server nginx curl ca-certificates
sudo adduser --system --group --home /opt/psico-luz psico-luz
sudo install -d -o psico-luz -g psico-luz -m 0750 /opt/psico-luz/app
sudo install -d -o psico-luz -g psico-luz -m 0750 /var/lib/psico-luz/uploads
sudo install -d -o psico-luz -g psico-luz -m 0750 /var/log/psico-luz
```

Instale Node.js 22 LTS desde una fuente mantenida para su distribución:

```bash
node --version
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm --version
```

Permita públicamente solo SSH restringido, HTTP para redirección y HTTPS. No
publique 4000, 5432 ni 6379.

## 2. PostgreSQL y Redis

Genere contraseñas únicas fuera del historial. Cree la base:

```bash
sudo -u postgres psql
```

```sql
CREATE ROLE psicologa_user LOGIN PASSWORD 'REEMPLACE_ESTA_CLAVE';
CREATE DATABASE psicologa_db OWNER psicologa_user;
\q
```

Configure Redis con `bind 127.0.0.1 ::1`, `protected-mode yes` y una contraseña
fuerte. Luego:

```bash
sudo systemctl restart postgresql redis-server
sudo systemctl enable postgresql redis-server
sudo -u postgres pg_isready
systemctl is-active redis-server
```

## 3. Instalar y configurar la aplicación

```bash
sudo -u psico-luz git clone https://github.com/ingesoft04/Psico_Luz.git /opt/psico-luz/app
cd /opt/psico-luz/app
sudo -u psico-luz git switch main
sudo -u psico-luz pnpm install --prod --frozen-lockfile
sudo -u psico-luz cp .env.example .env
sudo -u psico-luz mkdir -p logs uploads
sudo chmod 0600 .env
sudo chown psico-luz:psico-luz .env
```

Configure como mínimo:

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
LOG_FILE=/var/log/psico-luz/app.log
```

Complete los secretos y contraseñas obligatorios con valores únicos de al menos
32 caracteres. No copie `.env` al directorio público ni lo respalde sin cifrar.
Inicialice el esquema; `psql` solicita la contraseña sin imprimirla:

```bash
psql -h 127.0.0.1 -U psicologa_user -d psicologa_db \
  -v ON_ERROR_STOP=1 -f scripts/init.sql
```

## 4. Servicio systemd

Cree `/etc/systemd/system/psico-luz.service`:

```ini
[Unit]
Description=API Psico Luz
After=network-online.target postgresql.service redis-server.service
Wants=network-online.target

[Service]
Type=simple
User=psico-luz
Group=psico-luz
WorkingDirectory=/opt/psico-luz/app
EnvironmentFile=/opt/psico-luz/app/.env
ExecStart=/usr/bin/node /opt/psico-luz/app/src/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/psico-luz/uploads /var/log/psico-luz /opt/psico-luz/app/logs /opt/psico-luz/app/uploads
UMask=0077

[Install]
WantedBy=multi-user.target
```

Compruebe `command -v node` y ajuste `ExecStart` si cambia. Active el servicio:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now psico-luz
sudo systemctl status psico-luz --no-pager
curl --fail http://127.0.0.1:4000/health
```

## 5. Nginx y la subruta pública

Copie únicamente los archivos públicos:

```bash
sudo install -d -o root -g www-data -m 0750 /var/www/psicologia
sudo install -o root -g www-data -m 0640 \
  psicologa-luz-adriana.html agenda.html panel.html sesion-clinica.html \
  manifest.webmanifest icon.svg sw.js /var/www/psicologia/
```

Cree `/etc/nginx/sites-available/psico-luz`:

```nginx
server {
    listen 80;
    server_name ejemplo.com;

    location = /psicologia { return 301 /psicologia/; }

    location = /psicologia/health {
        proxy_pass http://127.0.0.1:4000/health;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /psicologia/api/ {
        rewrite ^/psicologia/(.*)$ /$1 break;
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /psicologia/ {
        root /var/www;
        index psicologa-luz-adriana.html;
        try_files $uri $uri/ /psicologia/psicologa-luz-adriana.html;
    }
}
```

Habilite y valide antes de recargar:

```bash
sudo ln -s /etc/nginx/sites-available/psico-luz /etc/nginx/sites-enabled/psico-luz
sudo nginx -t
sudo systemctl reload nginx
```

Instale el certificado con su mecanismo ACME y redirija HTTP a HTTPS. Nunca
recargue una configuración que no supere `nginx -t`.

## 6. Validar producción

```bash
systemctl is-active postgresql redis-server psico-luz nginx
curl --fail http://127.0.0.1:4000/health
curl --fail https://ejemplo.com/psicologia/health
curl --fail https://ejemplo.com/psicologia/
curl --fail https://ejemplo.com/psicologia/manifest.webmanifest
curl -I https://ejemplo.com/psicologia/api/v1/citas
```

La ruta protegida debe responder 401 sin token. Confirme que `.env`, `.git`,
logs, respaldos y puertos internos no sean públicos.

## 7. Respaldo, actualización y reversión

Antes de cada actualización:

```bash
sudo -u postgres pg_dump -Fc psicologa_db > /ruta/segura/psicologa_db_FECHA.dump
git fetch origin --prune
git status --short --branch
git log --oneline HEAD..origin/main
```

No continúe con cambios locales ni commits remotos sin revisar. Prepare otra
versión, instale con el lockfile y valide:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm prune --prod
sudo systemctl restart psico-luz
sudo nginx -t && sudo systemctl reload nginx
```

Repita la sección 6. Si falla, restaure la revisión y estáticos anteriores y
reinicie el servicio. Restaure PostgreSQL solo cuando sea necesario y después de
evaluar el impacto sobre datos posteriores al respaldo.
