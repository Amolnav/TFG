# Backups y restauración (N4.2)

> Con clientes reales, perder la base de reservas es perder al cliente.
> **Un backup que no se ha restaurado nunca no es un backup**: la prueba de
> restauración forma parte del alta de cada despliegue.

## Backups automáticos (producción)

El `docker-compose.prod.yml` incluye el servicio **`backup`**: un `pg_dump`
diario en formato *custom* al directorio `./backups` del host, con rotación
por días.

- Cadencia: cada 24 h desde el arranque del servicio.
- Formato: `backups/backup-<DB_NAME>-YYYYMMDD-HHMMSS.dump` (formato custom de
  `pg_dump`, comprimido y restaurable con `pg_restore`).
- Retención: `BACKUP_RETENTION_DAYS` (default **14**) — los dumps más
  antiguos se borran automáticamente.
- El directorio `backups/` está en `.gitignore`: los dumps contienen datos
  personales y **no se versionan**.

```bash
# ver los backups existentes
ls -lh backups/

# ver el log del servicio
docker compose -f docker-compose.prod.yml logs backup
```

> 💡 Los dumps quedan en el disco del host. Para resistir la pérdida de la
> máquina completa, sincroniza `./backups` a un almacenamiento externo
> (rclone/S3/rsync) desde el cron del host.

## Backup manual

```bash
# desarrollo (docker-compose.yml)
scripts/backup.sh

# producción
COMPOSE_ARGS="-f docker-compose.prod.yml" scripts/backup.sh
```

Variables opcionales: `COMPOSE_ARGS`, `DB_SERVICE` (default `db`), `DB_NAME`
(default: el del `.env`), `DB_USER` (default `postgres`).

## Restauración

```bash
scripts/restore.sh backups/backup-<...>.dump

# producción
COMPOSE_ARGS="-f docker-compose.prod.yml" scripts/restore.sh backups/backup-<...>.dump
```

- Usa `pg_restore --clean --if-exists --no-owner`: **sobrescribe** los datos
  actuales de la base. Pide confirmación (o `RESTORE_YES=true` para scripts).
- Tras restaurar, reinicia el backend:
  `docker compose [ARGS] restart backend`.

### Prueba de restauración (obligatoria al dar de alta un cliente)

1. `scripts/backup.sh`
2. Anota un dato verificable (p. ej. `SELECT count(*) FROM "Booking"`).
3. En un entorno de prueba, borra datos y ejecuta `scripts/restore.sh`.
4. Verifica que el dato vuelve a su valor.

Última prueba real ejecutada (2026-08-14, stack local):

```
✅ Backup creado: ./backups/backup-gestor_reservas-20260814-143410.dump (48K)
Reservas antes del desastre: 16
DELETE 5  (BookingEvent)
DELETE 16 (Booking)
Reservas tras el borrado (desastre simulado): 0
✅ Restauración completada desde backups/backup-gestor_reservas-20260814-143410.dump
Reservas tras restaurar: 16 (eventos de auditoría: 5)
```

## Variante Render (BD gestionada)

Si la base de datos vive en Render (plan de pago), los backups diarios son
**gestionados por la plataforma**:

- Render PostgreSQL hace snapshots diarios automáticos (retención según
  plan) y permite *point-in-time recovery* en los planes superiores.
- Restauración: desde el dashboard de Render → base de datos → "Backups" →
  restaurar a una instancia nueva, y apuntar `DATABASE_URL` del backend a
  esa instancia.
- Aun así, conviene un dump lógico periódico independiente de la plataforma:
  ```bash
  pg_dump "$DATABASE_URL_EXTERNA" -F c -f backup-render-$(date +%F).dump
  ```
  (usa la *External Database URL* de Render; el puerto 5432 exige TLS).

⚠️ El plan Free de Render **no incluye backups**: para cualquier cliente
real, usa un plan con backups o programa el `pg_dump` externo anterior.

## Monitorización relacionada

El backend expone `GET /health` (estado de la BD incluido): configura un
healthcheck externo (UptimeRobot, Better Stack, cron con curl) contra esa
ruta — ver [N4.3 en docs/PLAN_MEJORAS.md](./PLAN_MEJORAS.md).
