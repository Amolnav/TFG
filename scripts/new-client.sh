#!/usr/bin/env bash
# N4.5: aprovisionamiento de un cliente nuevo en UN comando.
# Objetivo: de cero a stack funcionando en menos de 15 minutos.
#
#   scripts/new-client.sh [opciones] <clave-dataset>
#
# La <clave-dataset> es la del restaurante en backend/prisma/restaurants/
# (p. ej. "bar-ejemplo"). Para crear un restaurante nuevo, sigue el paso 1 de
# docs/NUEVO_RESTAURANTE.md (copiar bar-ejemplo.ts y registrarlo) y después
# ejecuta este script. Nota: el plan original hablaba de un fichero
# restaurant.seed.json; la implementación de M6 usa datasets TypeScript
# TIPADOS (validados por seedConsistency.test.js), y este script lo respeta.
#
# Qué hace:
#   1. Valida que el dataset existe.
#   2. Genera el fichero .env con secretos aleatorios (si no existe).
#   3. Levanta el stack (db + backend + frontend) con docker compose.
#   4. Aplica las migraciones (las aplica el backend al arrancar) y siembra.
#   5. Verifica el /health y la identidad servida en /api/public/config.
#
# Opciones:
#   --prod              usa docker-compose.prod.yml (SEED_MODE=prod)
#   --env-file <f>      fichero .env a generar/usar (default: .env)
#   --project <nombre>  nombre de proyecto/contenedores (default: la clave)
#   --backend-port <n>  puerto del backend  (default: 4000)
#   --frontend-port <n> puerto del frontend (default: 5173 dev / 80 prod)
#   --db-port <n>       puerto de la BD     (default: 5433; solo dev)
#   --tz <zona>         zona horaria        (default: Europe/Madrid)
set -euo pipefail

cd "$(dirname "$0")/.."

MODE="dev"
ENV_FILE=".env"
PROJECT=""
BACKEND_PORT="4000"
FRONTEND_PORT=""
DB_PORT="5433"
TZ_VALUE="Europe/Madrid"
KEY=""

while [ $# -gt 0 ]; do
  case "$1" in
    --prod) MODE="prod"; shift ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --project) PROJECT="$2"; shift 2 ;;
    --backend-port) BACKEND_PORT="$2"; shift 2 ;;
    --frontend-port) FRONTEND_PORT="$2"; shift 2 ;;
    --db-port) DB_PORT="$2"; shift 2 ;;
    --tz) TZ_VALUE="$2"; shift 2 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) KEY="$1"; shift ;;
  esac
done

if [ -z "$KEY" ]; then
  echo "Uso: scripts/new-client.sh [opciones] <clave-dataset>   (--help para ayuda)" >&2
  exit 1
fi

PROJECT="${PROJECT:-$KEY}"
# nombre de proyecto compose válido (minúsculas, sin caracteres raros)
PROJECT="$(echo "$PROJECT" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-' | sed 's/-*$//')"
FRONTEND_PORT="${FRONTEND_PORT:-$([ "$MODE" = "prod" ] && echo 80 || echo 5173)}"

# 1. Validar el dataset ------------------------------------------------------
DATASET_FILE="$(grep -l "key: '$KEY'" backend/prisma/restaurants/*.ts 2>/dev/null | head -1 || true)"
if [ -z "$DATASET_FILE" ]; then
  echo "❌ El dataset '$KEY' no existe en backend/prisma/restaurants/." >&2
  echo "   Datasets disponibles:" >&2
  grep -h "key: '" backend/prisma/restaurants/*.ts | sed "s/.*key: *'\(.*\)'.*/   - \1/" | sort -u >&2
  exit 1
fi
echo "✅ Dataset '$KEY' encontrado ($DATASET_FILE)"

# En modo demo el admin es el demoAdmin del dataset (con la contraseña del .env)
DEMO_ADMIN_EMAIL="$(grep -A3 'demoAdmin' "$DATASET_FILE" | grep -o "email: *'[^']*'" | head -1 | cut -d"'" -f2 || true)"

# 2. Generar .env con secretos aleatorios ------------------------------------
rand() { openssl rand -hex "$1" 2>/dev/null || head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }

if [ -f "$ENV_FILE" ]; then
  echo "ℹ️  $ENV_FILE ya existe: se reutiliza sin tocar (bórralo para regenerar)"
else
  DB_PASSWORD="$(rand 16)"
  JWT_SECRET="$(rand 32)"
  ADMIN_EMAIL="admin@${KEY}.local"
  ADMIN_PASSWORD="$(rand 8)"
  DB_NAME="$(echo "$KEY" | tr -c 'a-z0-9' '_' | sed 's/_*$//')_db"

  cat > "$ENV_FILE" << EOF
# Generado por scripts/new-client.sh el $(date +%F) para '$KEY'
PROJECT_NAME=$PROJECT
DB_NAME=$DB_NAME
DB_PASSWORD=$DB_PASSWORD
DB_PORT=$DB_PORT
BACKEND_PORT=$BACKEND_PORT
FRONTEND_PORT=$FRONTEND_PORT
TZ=$TZ_VALUE
RESTAURANT=$KEY
SEED_MODE=$([ "$MODE" = "prod" ] && echo prod || echo demo)
SEED_ADMIN_EMAIL=$ADMIN_EMAIL
SEED_ADMIN_PASSWORD=$ADMIN_PASSWORD
JWT_SECRET=$JWT_SECRET
FRONTEND_URL=http://localhost:$FRONTEND_PORT
BACKUP_RETENTION_DAYS=14
EOF
  echo "✅ $ENV_FILE generado (secretos aleatorios incluidos)"
fi

# Cargar los valores efectivos del env-file
ADMIN_EMAIL="$(grep -E '^SEED_ADMIN_EMAIL=' "$ENV_FILE" | cut -d= -f2-)"
ADMIN_PASSWORD="$(grep -E '^SEED_ADMIN_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"
BACKEND_PORT="$(grep -E '^BACKEND_PORT=' "$ENV_FILE" | cut -d= -f2-)"
FRONTEND_PORT="$(grep -E '^FRONTEND_PORT=' "$ENV_FILE" | cut -d= -f2-)"
SEED_MODE_EFF="$(grep -E '^SEED_MODE=' "$ENV_FILE" | cut -d= -f2-)"
if [ "$SEED_MODE_EFF" != "prod" ] && [ -n "$DEMO_ADMIN_EMAIL" ]; then
  ADMIN_EMAIL="$DEMO_ADMIN_EMAIL"
fi

COMPOSE=(docker compose --env-file "$ENV_FILE" -p "$PROJECT")
if [ "$MODE" = "prod" ]; then
  COMPOSE+=(-f docker-compose.prod.yml)
fi

# 3. Levantar el stack -------------------------------------------------------
echo "→ Levantando stack '$PROJECT' ($MODE)..."
"${COMPOSE[@]}" up -d --build db backend frontend

# 4. Esperar al backend (aplica las migraciones al arrancar) -----------------
echo "→ Esperando al backend en :$BACKEND_PORT..."
for _ in $(seq 1 90); do
  if curl -sf "http://localhost:$BACKEND_PORT/health" > /dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 2
done
if [ -z "${HEALTHY:-}" ]; then
  echo "❌ El backend no respondió en :$BACKEND_PORT. Log:" >&2
  "${COMPOSE[@]}" logs --tail 30 backend >&2
  exit 1
fi
echo "✅ Backend sano (migraciones aplicadas)"

# 5. Sembrar -----------------------------------------------------------------
echo "→ Sembrando dataset '$KEY'..."
"${COMPOSE[@]}" exec -T backend npm run db:seed

# 6. Verificación final ------------------------------------------------------
NAME="$(curl -s "http://localhost:$BACKEND_PORT/api/public/config" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['restaurant_name'])" 2>/dev/null || echo '?')"

echo ""
echo "═══════════════════════════════════════════════════"
echo "🎉 Stack de '$NAME' listo"
echo "   🌐 Web pública:  http://localhost:$FRONTEND_PORT"
echo "   🛠️  Panel:        http://localhost:$FRONTEND_PORT/admin"
echo "   📡 API:          http://localhost:$BACKEND_PORT"
echo "   👤 Admin:        $ADMIN_EMAIL"
echo "   🔑 Contraseña:   $ADMIN_PASSWORD"
echo "      (guárdala: no se vuelve a mostrar)"
echo "═══════════════════════════════════════════════════"
echo "Siguientes pasos: afina identidad/carta desde el panel y ejecuta la"
echo "prueba de restauración de backup (docs/BACKUPS.md)."
