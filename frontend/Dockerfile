# BUG-30: Dockerfile de producción (docker-compose.prod.yml lo referenciaba
# pero no existía). Build multi-stage: Vite necesita las variables VITE_* en
# TIEMPO DE BUILD (como build-args), no como env de runtime.

# ── Etapa 1: build ──────────────────────────────────────────────
FROM node:22-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Con el proxy de nginx, la API y el socket son mismo-origen por defecto
ARG VITE_API_URL=/api
ARG VITE_SOCKET_URL=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL

RUN npm run build

# ── Etapa 2: servidor estático ─────────────────────────────────
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
