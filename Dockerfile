# ╔══════════════════════════════════════════════════════════╗
# ║  Dockerfile — Psicóloga Luz Adriana API                 ║
# ║  Multi-stage: deps → build → production                 ║
# ╚══════════════════════════════════════════════════════════╝

# ─── Stage 1: Dependencias reproducibles ─────────────────────
FROM node:25-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# ─── Stage 3: Producción ──────────────────────────────────────
FROM node:25-alpine AS production
LABEL maintainer="Psicóloga Luz Adriana <tech@psicologa.co>"
LABEL version="1.0.0"
LABEL description="Backend API — Psicóloga Luz Adriana"

# Seguridad: usuario no-root
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S nodeuser -u 1001 -G nodejs

WORKDIR /app

# Solo dependencias de producción
COPY --from=deps /app/node_modules ./node_modules
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
