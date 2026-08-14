# Evidencia: prueba de restauración de backup (N4.2)

Fecha: 2026-08-14 · Stack local (docker compose, proyecto tfg-e2e, BD gestor_reservas)

```
$ COMPOSE_ARGS="-p tfg-e2e" DB_NAME=gestor_reservas scripts/backup.sh
→ pg_dump de 'gestor_reservas' (servicio 'db') a ./backups/backup-gestor_reservas-20260814-143410.dump
✅ Backup creado: ./backups/backup-gestor_reservas-20260814-143410.dump (48K)

$ psql ... -c 'SELECT count(*) FROM "Booking"'
16                                  # reservas antes del desastre

$ psql ... -c 'DELETE FROM "BookingEvent"; DELETE FROM "Booking";'
DELETE 5
DELETE 16                           # desastre simulado

$ psql ... -c 'SELECT count(*) FROM "Booking"'
0

$ COMPOSE_ARGS="-p tfg-e2e" DB_NAME=gestor_reservas RESTORE_YES=true \
    scripts/restore.sh backups/backup-gestor_reservas-20260814-143410.dump
✅ Restauración completada desde backups/backup-gestor_reservas-20260814-143410.dump

$ psql ... -c 'SELECT count(*) FROM "Booking"'
16                                  # reservas recuperadas
$ psql ... -c 'SELECT count(*) FROM "BookingEvent"'
5                                   # auditoría recuperada
```

Resultado: ✅ el backup generado en local se restaura íntegro con scripts/restore.sh.
