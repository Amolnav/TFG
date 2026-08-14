
FROM node:22-slim

WORKDIR /app

# Instalamos OpenSSL (necesario para Prisma)
RUN apt-get update -y && apt-get install -y openssl

# Copiamos archivos de dependencias
COPY package*.json ./

# Instalamos dependencias
RUN npm install

# Copiamos el código
COPY . .

# Generamos el cliente. BUG-30: la URL dummy se limita a este RUN; antes
# quedaba como ENV de la imagen final y enmascaraba errores de configuración
# (sin DATABASE_URL real, Prisma intentaba conectar a "dummy" en vez de
# fallar por variable ausente).
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate

EXPOSE 4000

# BUG-30: producción arranca con node (npm start), no con nodemon
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]