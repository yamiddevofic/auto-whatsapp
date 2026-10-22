# Imagen multi-etapa: los secretos NUNCA se copian a la imagen y el proceso no corre como
# root. Ver Docs/02-hallazgos-seguridad.md SEC-016.
#
#   docker build -t auto-whatsapp .
#   docker run --env-file .env -p 127.0.0.1:3001:3001 -v aw-data:/var/lib/auto-whatsapp auto-whatsapp

FROM node:22-alpine AS build
# git: Baileys depende de libsignal desde un repositorio git (fijado a un commit)
RUN apk add --no-cache git
WORKDIR /app

COPY server/package*.json server/.npmrc ./server/
COPY client/package*.json ./client/
# --ignore-scripts: better-sqlite3, sharp y esbuild traen binarios precompilados (también
# para musl); así no hace falta toolchain de compilación ni se ejecutan scripts de terceros
RUN cd server && npm ci --omit=dev --ignore-scripts \
 && cd ../client && npm ci --ignore-scripts

COPY server/src ./server/src
COPY client ./client
RUN cd client && npm run build

FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production \
    DATA_DIR=/var/lib/auto-whatsapp \
    BIND_ADDR=0.0.0.0 \
    PORT=3001

COPY --from=build --chown=node:node /app/server/node_modules ./server/node_modules
COPY --from=build --chown=node:node /app/server/package.json ./server/package.json
COPY --from=build --chown=node:node /app/server/src ./server/src
COPY --from=build --chown=node:node /app/client/dist ./client/dist

RUN install -d -o node -g node -m 700 /var/lib/auto-whatsapp
VOLUME /var/lib/auto-whatsapp

USER node
EXPOSE 3001

# /health responde 200 aunque WhatsApp no esté vinculado (proceso vivo);
# /health/ready exige la sesión de WhatsApp conectada.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3001/health > /dev/null || exit 1

CMD ["node", "server/src/index.js"]
