#!/usr/bin/env bash
# N4.2: backup manual de la base de datos del stack de docker compose.
#
# Uso:
#   scripts/backup.sh [directorio-destino]
#
# Variables opcionales:
#   COMPOSE_ARGS  argumentos extra para docker compose (p. ej. "-p miproyecto -f docker-compose.prod.yml")
#   DB_SERVICE    nombre del servicio de BD en el compose (default: db)
#   DB_NAME       nombre de la base de datos (default: el DB_NAME del .env, o "restaurant")
#   DB_USER       usuario de PostgreSQL (default: postgres)
#
# El backup en producción lo hace a diario el servicio `backup` del
# docker-compose.prod.yml; este script cubre backups manuales y la prueba
# de restauración en local.
set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="${1:-./backups}"
DB_SERVICE="${DB_SERVICE:-db}"
DB_USER="${DB_USER:-postgres}"

if [ -z "${DB_NAME:-}" ] && [ -f .env ]; then
  DB_NAME="$(grep -E '^DB_NAME=' .env | tail -1 | cut -d= -f2- | tr -d '"' || true)"
fi
DB_NAME="${DB_NAME:-restaurant}"

mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/backup-${DB_NAME}-$(date +%Y%m%d-%H%M%S).dump"

echo "→ pg_dump de '$DB_NAME' (servicio '$DB_SERVICE') a $FILE"
# shellcheck disable=SC2086
docker compose ${COMPOSE_ARGS:-} exec -T "$DB_SERVICE" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" -F c > "$FILE"

echo "✅ Backup creado: $FILE ($(du -h "$FILE" | cut -f1))"
