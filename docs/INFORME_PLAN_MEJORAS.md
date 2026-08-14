# Informe de implementación — PLAN_MEJORAS.md (N1–N4)

> Ejecutado el 14-08-2026 sobre la base white-label de PLAN_MODULARIDAD.md.
> Las 20 mejoras de los goles G-A…G-E están implementadas, con tests
> rojo→verde donde aplica y **todas las suites verdes en todo momento**.
> Los cambios están en el working tree, sin commitear.

## 1. Verificación final

| Verificación | Resultado |
|---|---|
| Backend `npm test` | ✅ 230/230 (42 ficheros) — también con `TZ=UTC` |
| Backend `npm run test:integration` (BD real) | ✅ 7/7 — también con `TZ=UTC` |
| Backend `npm run lint` | ✅ 0 errores |
| Frontend `vitest run` | ✅ 47/47 (10 ficheros) |
| Frontend `npm run lint` | ✅ 0 errores, 0 warnings |
| Frontend `tsc -b && vite build` | ✅ |
| E2E Playwright (compose db+backend+seed) | ✅ 8/8 en 3 specs |
| Prueba de fuego white-label | ✅ `grep` marca = 0 en `src/`; `seedConsistency` verde; `new-client.sh bar-ejemplo` levanta el stack completo |
| CI (`.github/workflows/ci.yml`) | ✅ Sin pasos nuevos: las suites y specs nuevos corren dentro de los jobs existentes (backend / frontend / e2e) |
| `scripts/restore.sh` con backup real | ✅ ver §6 |

E2E ampliado (nuevos flujos exigidos):
- `e2e/manage.spec.ts` — **cancelación por enlace de autogestión** (2 tests).
- `e2e/staff.spec.ts` — **alta de staff + login del usuario nuevo** (2 tests).
- `e2e/reservation.spec.ts` (adaptado) — **calendario con días cerrados deshabilitados** (test 4).

Recordatorios, lista de espera, reseñas y RGPD se cubren en unit/integración
con el **reloj congelado** del setup global (`FROZEN_NOW`), como pedía el plan.

## 2. Estado ficha a ficha

| Ficha | Estado | Notas / desviaciones documentadas |
|---|---|---|
| N1.1 Autogestión por enlace | ✅ Implementada | `/reserva/:token` sobre `Booking.confirmationToken`; PII enmascarada; cancelar + cambiar hora contra disponibilidad; enlace en el email de confirmación y en la pantalla de éxito; las reservas de backoffice también reciben token. |
| N1.2 Recordatorio + reconfirmación | ✅ Implementada | node-cron cada 10 min; `emailSentAt` como guarda (at-most-once, sobrevive reinicios); política `notify` (aviso socket al panel) o `autocancel`; `/reconfirmar/:token` marca `RECONFIRMED` (idempotente). |
| N1.3 Emails de ciclo de vida | ✅ Implementada | Cancelación (cliente/restaurante), modificación y cierre sobrevenido, multiidioma (es/en/fr) con el tema del restaurante. *Desviación conservadora*: el cierre solo cancela+avisa si el staff marca `notifyAffected` en el formulario (explícito, no automático). |
| N1.4 Lista de espera | ✅ Implementada | Sobre el modelo `Waitlist`; alta desde días "completos" del calendario; al cancelarse una reserva compatible se avisa al primero (guarda `notifiedAt`); el aviso caduca (`waitlist_hold_hours`) y el barrido pasa al siguiente; pestaña en el panel; se resuelve sola si el cliente reserva. |
| N2.1 CRUD de staff | ✅ Implementada | Sección Equipo (solo ADMIN): alta/baja/rol/activo/reset contraseña; guardas de último ADMIN y de auto-modificación; política mínima de contraseñas; auditoría por log. |
| N2.2 Vista de sala | ✅ Implementada | `/admin/sala`: grid mesas × franjas del turno; drag (dnd-kit) a otra mesa → `reassign`; botón Walk-in (`SEATED` + `WALK_IN`, cliente sintético `walkin@local`); refresco por sockets. |
| N2.3 Hoja de servicio | ✅ Implementada | `/admin/servicio` imprimible (`@media print`): reservas por hora con alérgenos destacados, VIP, notas y pax; botón en el dashboard. |
| N2.4 Métricas históricas | ✅ Implementada | `/admin/informes`: ocupación por día, horas punta, tasa no-show, nuevos vs recurrentes, top clientes; agregación en una query + gráficas **SVG propias** (sin dependencia). |
| N2.5 Auditoría de reservas | ✅ Implementada | Tabla `BookingEvent` (migración aditiva) alimentada desde TODOS los puntos de mutación (staff, cliente, sistema); timeline 📜 en el listado de reservas. |
| N3.1 Calendario con disponibilidad | ✅ Implementada | Reconecta `GET /availability/calendar`; días cerrados/completos deshabilitados; navegación limitada por `booking_max_days_ahead` (nuevo en el payload de availability/config). |
| N3.2 Zona en el wizard | ✅ Implementada | Selector "¿Dónde prefieres sentarte?" si `zone_selection_enabled` y >1 zona; `zoneId` fluye a calendario, horarios y reserva; zonas activas expuestas en `/api/public/config`. |
| N3.3 Alérgenos y foto en carta | ✅ Implementada | `MenuItem.allergens[]` + `photoUrl` (migración aditiva); editor con los 14 alérgenos UE; badges y foto en la carta pública; sin subida de ficheros (URL). |
| N3.4 Reseña post-visita | ✅ Implementada | Al pasar a COMPLETED; activable por config; cadencia por cliente con guarda persistente `BookingEvent REVIEW_REQUEST_SENT`; enlace directo a reseñar en Google (`GOOGLE_PLACE_ID`). |
| N3.5 SEO por restaurante | ✅ Implementada | JSON-LD `Restaurant` con horario derivado de los turnos; meta description/OG desde config; `hreflang` de idiomas activos; `sitemap.xml` generado por el backend (proxy nginx) + `robots.txt`. En Render Static el sitemap requiere apuntar al backend (documentado). |
| N4.1 Rate limiting + captcha | ✅ Implementada | `express-rate-limit` en `/api/public/*` (por minuto) y `/api/auth/login` (solo intentos fallidos); límites editables por config; Cloudflare Turnstile activable por config y **desactivado por defecto** (fail-open si Cloudflare cae). |
| N4.2 Backups + restauración | ✅ Implementada | Servicio `backup` en compose de prod (pg_dump diario, rotación `BACKUP_RETENTION_DAYS`); `scripts/backup.sh` y `scripts/restore.sh`; **restauración probada con un backup real** (§6); variante Render documentada en `docs/BACKUPS.md`. |
| N4.3 Logging + monitorización | ✅ Implementada | `pino` + `pino-http` sustituyen a todos los `console.*` y a morgan; redacción de sensibles compartida con el errorHandler; `X-Request-Id` por petición (respeta el del proxy); Sentry **opcional** vía `SENTRY_DSN` (no-op sin DSN; el paquete `@sentry/node` se instala solo si se usa). |
| N4.4 RGPD | ✅ Implementada | "Exportar datos" (JSON completo) y "Anonimizar" (PII → placeholders **sin borrar filas**; notas eliminadas, texto libre de reservas limpiado, estadística intacta) en la ficha de cliente; retención automática (`gdpr_retention_months`, job diario). |
| N4.5 Aprovisionamiento en un comando | ✅ Implementada | `scripts/new-client.sh <clave>`: valida el dataset, genera `.env` con secretos aleatorios, levanta, migra, siembra y verifica. **Probado en real: 17–39 s** (objetivo <15 min). *Desviación heredada de M6*: la entrada es un dataset TS tipado, no un `restaurant.seed.json` (misma decisión que tomó la modularidad; validado por `seedConsistency`). |
| N4.6 PWA del panel | ✅ Implementada | `manifest.webmanifest` + `sw.js` mínimo (los datos van SIEMPRE a red; estáticos red-primero con respaldo); manifest/favicon/theme-color **dinámicos con la marca** (nombre + logo del restaurante); registro solo en producción. |

## 3. Endpoints nuevos

**Públicos** (todos bajo el rate limiting de N4.1):

| Método | Ruta | Ficha |
|---|---|---|
| GET | `/api/public/reservations/manage/:token` | N1.1 |
| POST | `/api/public/reservations/manage/:token/cancel` | N1.1 |
| POST | `/api/public/reservations/manage/:token/reschedule` | N1.1 |
| POST | `/api/public/reservations/reconfirm/:token` | N1.2 |
| POST | `/api/public/reservations/waitlist` | N1.4 |
| GET | `/sitemap.xml` | N3.5 |

Ampliaciones retrocompatibles: `/api/public/config` añade `zones`,
`zone_selection_enabled`, `waitlist_enabled`, `captcha_enabled`,
`captcha_site_key`; `/availability/config` añade `maxDaysAhead`; la creación
pública devuelve `booking.manageToken`.

**Backoffice** (JWT; ADMIN donde se indica):

| Método | Ruta | Ficha |
|---|---|---|
| GET/POST | `/api/backoffice/staff` (ADMIN) | N2.1 |
| PATCH/DELETE | `/api/backoffice/staff/:id` (ADMIN) | N2.1 |
| GET | `/api/backoffice/waitlist` | N1.4 |
| PATCH | `/api/backoffice/waitlist/:id/resolve` | N1.4 |
| DELETE | `/api/backoffice/waitlist/:id` | N1.4 |
| GET | `/api/backoffice/reports?from&to` | N2.4 |
| GET | `/api/backoffice/bookings/:id/events` | N2.5 |
| POST | `/api/backoffice/bookings/walkin` | N2.2 |
| GET | `/api/backoffice/customers/:id/export` | N4.4 |
| POST | `/api/backoffice/customers/:id/anonymize` (ADMIN) | N4.4 |

`POST /api/backoffice/closures` acepta además `notifyAffected` y devuelve
`cancelledBookings` (N1.3).

## 4. Claves de configuración nuevas (configSchema validado)

| Clave | Default | Pública | Ficha |
|---|---|---|---|
| `reminder_enabled` | `true` | no | N1.2 |
| `reminder_hours_before` | `24` | no | N1.2 |
| `reminder_unconfirmed_policy` | `notify` | no | N1.2 |
| `reminder_autocancel_hours_before` | `4` | no | N1.2 |
| `waitlist_enabled` | `true` | sí | N1.4 |
| `waitlist_hold_hours` | `2` | no | N1.4 |
| `review_request_enabled` | `false` | no | N3.4 |
| `review_request_min_days_between` | `30` | no | N3.4 |
| `zone_selection_enabled` | `false` | sí | N3.2 |
| `gdpr_retention_months` | `0` (desactivado) | no | N4.4 |
| `rate_limit_public_per_minute` | `60` | no | N4.1 |
| `rate_limit_login_per_15min` | `10` | no | N4.1 |
| `captcha_enabled` | `false` | sí | N4.1 |
| `captcha_site_key` | `''` | sí | N4.1 |
| `captcha_secret_key` | `''` | **no** | N4.1 |

Todas editables desde el panel (sección **🤖 Automatizaciones** de
Configuración) o por `PATCH /api/backoffice/config`. Defaults neutros: la
prueba de fuego sigue montándose sin tocar `src/`.

Variables de entorno nuevas: `LOG_LEVEL`, `SENTRY_DSN` (opcional),
`BACKUP_RETENTION_DAYS`, `DISABLE_SCHEDULER` (documentadas en `.env.example`).

## 5. Jobs del scheduler (node-cron, en el propio backend)

| Job | Cadencia | Guarda de idempotencia |
|---|---|---|
| Recordatorios (T-`reminder_hours_before`) | cada 10 min | `emailSentAt` se marca ANTES de enviar (at-most-once, sobrevive reinicios) |
| No reconfirmadas (notify/autocancel a T-X) | cada 10 min | `reconfirmedAt`/estado; dedup del aviso al panel |
| Lista de espera: caducidad y avance de cola | cada 10 min | `notifiedAt` (un aviso por entrada) + `isResolved` |
| Retención RGPD | diario 04:30 | idempotente (email `@anonimo.local`) |
| Backup pg_dump (contenedor `backup`, prod) | diario | ficheros con timestamp + rotación por días |

Desactivable con `DISABLE_SCHEDULER=true`. Diseño single-instance (una
instancia por restaurante); para multi-instancia futura, proteger el barrido
con el advisory lock existente.

**Emails nuevos** (multiidioma es/en/fr, tema del restaurante): cancelación
(cliente/restaurante), modificación, cierre sobrevenido, recordatorio con
reconfirmación, hueco libre de lista de espera y petición de reseña; la
confirmación incorpora el botón "Gestionar mi reserva".

## 6. Evidencia de la restauración de backup (N4.2)

Prueba real ejecutada el 14-08-2026 sobre el stack local (detalle completo en
`docs/evidencias/backup-restore-test.md` y procedimiento en `docs/BACKUPS.md`):

```
✅ Backup creado: ./backups/backup-gestor_reservas-20260814-143410.dump (48K)
Reservas antes del desastre: 16
DELETE 5 (BookingEvent) · DELETE 16 (Booking)   ← desastre simulado
Reservas tras el borrado: 0
✅ Restauración completada (scripts/restore.sh)
Reservas tras restaurar: 16 · Eventos de auditoría: 5   ← íntegro
```

## 7. Cambios de esquema y dependencias

- Migraciones **aditivas** (las autorizadas por el plan):
  `20260814130426_add_booking_events` (tabla `BookingEvent`) y
  `20260814134923_menu_item_allergens_photo` (`MenuItem.allergens[]`,
  `MenuItem.photoUrl`). Ninguna columna/tabla eliminada; API retrocompatible.
- Dependencias backend nuevas: `express-rate-limit`, `node-cron`, `pino`,
  `pino-http` (se elimina `morgan`, sustituido por pino-http). `@sentry/node`
  es opcional y NO se añade al package.json.
- Frontend: **cero dependencias nuevas** (gráficas SVG propias; dnd-kit ya
  era dependencia).

## 8. Restricciones respetadas

- Nunca se puede desactivar/degradar/borrar al último ADMIN activo (tests).
- Los jobs no duplican envíos tras reinicios (guardas en BD, tests con reloj congelado).
- Prueba de fuego white-label intacta; todas las funciones nuevas con defaults neutros.
- Fuera de alcance respetado: nada de N5, sin subida de ficheros, sin commits/push/despliegues, emails solo con spies en tests (`EMAIL_OVERRIDE_RECIPIENT` para pruebas manuales).
