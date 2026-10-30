# Entorno de prueba y promoción a producción

Última actualización: 30 de octubre de 2026.

Toda modificación debe validarse en el entorno aislado antes de llegar a
producción. La existencia del entorno de prueba no autoriza una fusión: el PR
se fusiona únicamente después de la revisión y aprobación explícita del
responsable.

## Entornos publicados

| Entorno | URL | Puerto local en la VM | Datos | Contenedores |
|---|---|---:|---|---|
| Prueba | `https://test-psicologia.dev-fmv.duckdns.org/` | `127.0.0.1:8280` | Base y volúmenes exclusivos | `psicologa_test_*` |
| Producción | `https://psicologia.dev-fmv.duckdns.org/` | `8180` | Datos reales | `psicologa_*` |

Ambos dominios terminan TLS en el proxy inverso de la VM Ubuntu. El proxy sólo
publica el Nginx de cada entorno; PostgreSQL, Redis y la API no se exponen
directamente a Internet.

Las páginas de prueba muestran arriba y sólo cuando el host comienza por
`test-` el aviso:

> **Entorno de prueba · Los cambios aquí aún no están en producción**

El aviso está incluido en la página principal, agenda, panel y sesión clínica.
Producción no debe mostrarlo.

## Aislamiento implementado

El despliegue se define en `docker-compose.test.yml`, combinado con
`docker-compose.yml` y el nombre de proyecto fijo `psico_luz_test`.

- Red exclusiva `psico_luz_test_net`, subred `172.29.0.0/16`.
- Base `psicologa_test` con usuario y contraseña exclusivos.
- PostgreSQL fijado por digest a una imagen Debian verificada.
- Redis, logs y uploads en volúmenes exclusivos de prueba.
- Contenedores `psicologa_test_postgres`, `psicologa_test_redis`,
  `psicologa_test_api` y `psicologa_test_nginx`.
- Secretos de prueba aleatorios y diferentes de producción.
- Correo, Twilio, Telegram, Google Calendar, Claude y Gemini deshabilitados.
- Respuestas con `Cache-Control: no-store, private` y
  `X-Robots-Tag: noindex, nofollow, noarchive`.

Test no reutiliza la base, dumps, `.env`, cuentas, secretos, logs, uploads, red
ni volúmenes de producción.

## Ubicación en la VM Ubuntu

| Recurso | Ruta |
|---|---|
| Aplicación de prueba | `/home/fmv/apps/Psico_Luz-test` |
| Variables privadas | `/home/fmv/apps/Psico_Luz-test/.env` |
| Credenciales de prueba | `/home/fmv/apps/Psico_Luz-test/TEST_CREDENTIALS` |
| Respaldo inicial | `/home/fmv/backups/psico-luz-test-20261029T183031Z` |
| Respaldo de dependencias | `/home/fmv/backups/psico-luz-test-deps-20261029T183700Z` |

Los archivos con secretos deben conservar permisos `0600`. No muestre sus
valores en logs, incidencias, commits ni capturas.

## Preparar un cambio

1. Ejecute `git fetch origin --prune`.
2. Confirme que el árbol está limpio y compare con el upstream:

   ```bash
   git status --short --branch
   git rev-list --left-right --count HEAD...@{upstream}
   ```

3. Actualice la rama desde `main` si el remoto avanzó.
4. Trabaje en una rama; nunca edite directamente `main`.
5. Ejecute las validaciones:

   ```bash
   pnpm install --frozen-lockfile
   pnpm lint
   pnpm test
   pnpm audit --prod --audit-level high
   docker build -t psico-luz-validation .
   ```

6. Publique la rama y abra un pull request sin fusionarlo.
7. Espere que todos los controles de GitHub terminen correctamente.

## Desplegar la rama en prueba

Compruebe que los archivos transferidos pertenecen al commit aprobado mediante
el SHA del commit y hashes SHA-256. Respalde todo archivo que vaya a reemplazar.

```bash
cd /home/fmv/apps/Psico_Luz-test

docker compose \
  -p psico_luz_test \
  -f docker-compose.yml \
  -f docker-compose.test.yml \
  config --quiet

docker compose \
  -p psico_luz_test \
  -f docker-compose.yml \
  -f docker-compose.test.yml \
  up -d --build
```

No omita `-p psico_luz_test`: Compose podría crear volúmenes con otro nombre y
tratar de reemplazar contenedores equivocados.

El `.env` de prueba debe incluir como mínimo:

```dotenv
NODE_ENV=production
HTTP_PORT=127.0.0.1:8280
APP_URL=https://test-psicologia.dev-fmv.duckdns.org
FRONTEND_URL=https://test-psicologia.dev-fmv.duckdns.org
PUBLIC_BASE_PATH=
POSTGRES_DB=psicologa_test
POSTGRES_USER=psicologa_test
DB_HOST=postgres
REDIS_HOST=redis
```

## Validación obligatoria en prueba

- Los cuatro contenedores `psicologa_test_*` están activos; API, PostgreSQL y
  Redis aparecen saludables.
- `/`, `/agenda`, `/panel`, `/manifest.json`, `/sw.js`, `/health` y la
  documentación de API responden correctamente.
- `/health` informa `postgres: ok` y `redis: ok`.
- `/api/v1/auth/me` devuelve `401` sin token.
- CORS acepta el origen de prueba y rechaza sitios ajenos.
- El certificado TLS es válido.
- El aviso aparece con el texto exacto y no aparece en producción.
- Registro, inicio de sesión, agenda y panel funcionan con cuentas ficticias.
- No salen correos, mensajes, eventos de calendario ni solicitudes de IA.
- Los logs no contienen errores nuevos.
- Producción continúa respondiendo `200` en `/` y `/health`.

El usuario revisa la URL de prueba. La rama permanece sin fusionar mientras
existan observaciones.

## Promover a producción

Sólo después de la autorización explícita:

1. Ejecute de nuevo `git fetch origin --prune` y confirme que `main`, la rama y
   el PR no avanzaron inesperadamente.
2. Muestre el commit, los cambios, los controles y el plan de reversión.
3. Fusione el PR y registre el SHA resultante en `main`.
4. Respalde PostgreSQL, `.env`, código y proxy; etiquete la imagen activa.
5. Construya exactamente el commit fusionado. Nunca copie imágenes, datos,
   secretos o volúmenes desde prueba.
6. Despliegue y espere que todos los servicios estén saludables.
7. Repita las pruebas públicas, funcionales y la revisión de logs.
8. Si falla una comprobación crítica, revierta imagen y código; restaure datos
   sólo si una migración los modificó.

El entorno de prueba permanece disponible para el siguiente cambio.

## Implementación inicial registrada

La implementación se preparó en `codex/test-environment`, PR `#20`, e incluye:

- Entorno aislado y aviso visual condicional.
- Pruebas automatizadas del aviso y del aislamiento.
- PostgreSQL reproducible fijado por digest.
- Logs y uploads en volúmenes administrados exclusivos.
- Actualización de dependencias y eliminación de dependencias no utilizadas.
- Auditoría sin vulnerabilidades conocidas, 28 pruebas y lint aprobados, imagen
  Docker construida y dos controles de seguridad de GitHub aprobados.

El PR debe continuar abierto hasta recibir aprobación explícita para fusionar.

## Diagnóstico y reversión de prueba

```bash
cd /home/fmv/apps/Psico_Luz-test

docker compose -p psico_luz_test \
  -f docker-compose.yml -f docker-compose.test.yml ps

docker compose -p psico_luz_test \
  -f docker-compose.yml -f docker-compose.test.yml logs --tail=200 api nginx

curl -fsS https://test-psicologia.dev-fmv.duckdns.org/health
```

Para revertir, restaure el respaldo previo, reconstruya la API con el mismo
nombre de proyecto y repita las comprobaciones. No elimine volúmenes ni restaure
una base sin identificar antes el contenedor, proyecto y respaldo exactos.
