# Mismo estilo que intranet-api-auth. NO se ha construido ni probado en este entorno (sin Docker): validar en el servidor.
FROM node:22.12-alpine3.20

# Zona horaria y OpenSSL (lo necesita el motor de Prisma en Alpine)
RUN apk add --no-cache tzdata openssl

WORKDIR /usr/src/app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .

EXPOSE 3000

# Aplica las migraciones pendientes (solo toca el esquema de DATABASE_URL) y arranca el servicio.
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
