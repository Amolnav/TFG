#!/usr/bin/env bash
# N4.2: restauración de un backup generado por scripts/backup.sh o por el
# servicio `backup` del compose de producción (formato custom de pg_dump).
#
# Uso:
#   scripts/restore.sh <fichero.dump>
#
# Variables opcionales (las mismas que backup.sh):
#   COMPOSE_ARGS  argumentos extra para docker compose (p. ej. "-p miproyecto -f docker-compose.prod.yml")
#   DB_SERVICE    nombre del servicio de BD en el compose (default: db)
#   DB_NAME       nombre de la base de datos (default: el DB_NAME del .env, o "restaurant")
#   DB_USER       usuario de PostgreSQL (default: postgres)
#
# ⚠️ SOBRESCRIBE los datos actuales de la base (--clean). Pide confirmación
# salvo que se ejecute con RESTORE_YES=true.
set -euo pipefail

cd "$(dirname "$0")/.."

DUMP="${1:?Uso: scripts/restore.sh <fichero.dump>}"
DB_SERVICE="${DB_SERVICE:-db}"
DB_USER="${DB_USER:-postgres}"

if [ ! -f "$DUMP" ]; then
  echo "❌ No existe el fichero de backup: $DUMP" >&2
  exit 1
fi

if [ -z "${DB_NAME:-}" ] && [ -f .env ]; then
  DB_NAME="$(grep -E '^DB_NAME=' .env | tail -1 | cut -d= -f2- | tr -d '"' || true)"
fi
DB_NAME="${DB_NAME:-restaurant}"

echo "⚠️  Vas a restaurar '$DUMP' sobre la base '$DB_NAME' (servicio '$DB_SERVICE')."
echo "    Los datos actuales de esa base se SOBRESCRIBEN."
if [ "${RESTORE_YES:-}" != "true" ]; then
  read -r -p "¿Continuar? (escribe 'si'): " answer
  if [ "$answer" != "si" ]; then
    echo "Cancelado."
    exit 1
  fi
fi

echo "→ Restaurando..."
# --clean --if-exists: recrea los objetos; --no-owner: independiente del rol original
# shellcheck disable=SC2086
docker compose ${COMPOSE_ARGS:-} exec -T "$DB_SERVICE" \
  pg_restore --clean --if-exists --no-owner -U "$DB_USER" -d "$DB_NAME" < "$DUMP"

echo "✅ Restauración completada desde $DUMP"
echo "   Reinicia el backend si estaba levantado: docker compose ${COMPOSE_ARGS:-} restart backend"
