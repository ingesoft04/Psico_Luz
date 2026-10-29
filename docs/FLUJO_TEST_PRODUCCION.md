# Flujo obligatorio de test a producción

Toda modificación debe pasar por el entorno aislado antes de llegar a producción.

| Entorno | URL | Datos | Contenedores |
|---|---|---|---|
| Test | `https://test-psicologia.dev-fmv.duckdns.org/` | Base vacía y volúmenes exclusivos | `psicologa_test_*` |
| Producción | `https://psicologia.dev-fmv.duckdns.org/` | Datos reales | `psicologa_*` |

Test no reutiliza la base, Redis, secretos, cuentas, logs, uploads, red ni imagen
de producción. Las integraciones de correo, mensajería, calendario e IA están
deshabilitadas para evitar efectos externos.

## 1. Preparar un cambio

1. Ejecute `git fetch origin --prune`.
2. Confirme que la rama parte del `main` remoto actualizado y que el árbol está
   limpio.
3. Trabaje en una rama `codex/*`; nunca edite directamente `main`.
4. Ejecute lint, pruebas unitarias, auditoría de dependencias y construcción de
   la imagen.
5. Publique la rama y abra un pull request sin fusionarlo.

## 2. Desplegar la rama en test

En el directorio test de la VM:

```bash
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

El `.env` test debe usar como mínimo:

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

Todos los secretos deben ser exclusivos de test, aleatorios y distintos entre
sí. No copie `.env` ni un dump de producción.

## 3. Lista de comprobación en test

- Los cuatro contenedores `psicologa_test_*` están activos y saludables.
- `/`, `/agenda.html`, `/panel.html`, `/manifest.webmanifest`, `/sw.js`,
  `/health` y `/api/v1/docs` responden correctamente.
- Una API protegida responde `401` sin token.
- CORS permite únicamente el origen test.
- Registro, inicio de sesión, agenda y panel funcionan con cuentas ficticias.
- No se envían correos, mensajes, eventos de calendario ni solicitudes de IA.
- Se revisan logs sin errores y se documenta el commit probado.

El usuario revisa la URL test. La rama permanece sin fusionar mientras existan
observaciones.

## 4. Promover a producción

Solo después de la autorización explícita del usuario:

1. Verifique de nuevo que el PR y sus controles estén aprobados y que `main` no
   haya avanzado inesperadamente.
2. Fusione el PR y confirme el commit resultante.
3. Cree y valide un respaldo de PostgreSQL, `.env`, código y configuración.
4. Etiquete la imagen activa para reversión.
5. Construya exactamente el commit aprobado.
6. Despliegue sin copiar datos, secretos ni volúmenes desde test.
7. Repita las comprobaciones públicas y conserve la URL anterior cuando aplique.
8. Si falla salud o una prueba crítica, ejecute la reversión inmediatamente.

Test permanece disponible para el siguiente cambio. Nunca se promueve un volumen
o base de datos; se promueve únicamente el commit y su imagen reproducible.
