# Mismo estilo que intranet-api-auth, con mejoras: corre sin privilegios y tiene healthcheck.
FROM node:22.12-alpine3.20

# Zona horaria y OpenSSL (lo necesita el motor de Prisma en Alpine)
RUN apk add --no-cache tzdata openssl

WORKDIR /usr/src/app

# Primero las dependencias (se reutiliza la capa mientras no cambien). `postinstall` genera el cliente de Prisma,
# por eso el esquema debe estar antes de `npm ci`.
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .

ENV NODE_ENV=production
# El servicio no necesita ser administrador dentro del contenedor: el usuario "node" ya viene en la imagen.
USER node

EXPOSE 3000

# Marca el contenedor como saludable solo si el servicio responde.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

# Aplica las migraciones pendientes (solo toca el esquema de DATABASE_URL) y arranca el servicio.
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
