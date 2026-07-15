# ╔══════════════════════════════════════════════════════════╗
# ║  Dockerfile — Psicóloga Luz Adriana API                 ║
# ║  Multi-stage: deps → build → production                 ║
# ╚══════════════════════════════════════════════════════════╝

# ─── Stage 1: Dependencias ────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && cp -R node_modules /tmp/prod_modules
RUN npm install --no-audit --no-fund

# ─── Stage 2: Build ───────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build 2>/dev/null || echo "No build step needed"

# ─── Stage 3: Producción ──────────────────────────────────────
FROM node:20-alpine AS production
LABEL maintainer="Psicóloga Luz Adriana <tech@psicologa.co>"
LABEL version="1.0.0"
LABEL description="Backend API — Psicóloga Luz Adriana"

# Seguridad: usuario no-root
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S nodeuser -u 1001 -G nodejs

WORKDIR /app

# Solo dependencias de producción
COPY --from=deps /tmp/prod_modules ./node_modules
COPY --chown=nodeuser:nodejs . .

# Directorios necesarios
RUN mkdir -p logs uploads && \
    chown -R nodeuser:nodejs logs uploads

# Herramientas mínimas
RUN apk add --no-cache wget curl tini

USER nodeuser

EXPOSE 4000

# Tini como init para manejo correcto de señales
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
