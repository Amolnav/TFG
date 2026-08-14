# Plan de mejoras — roadmap de producto white-label

> Tercer documento de la serie. [PLAN_BUGS_Y_TESTS.md](./PLAN_BUGS_Y_TESTS.md)
> (implementado) estabilizó el sistema; [PLAN_MODULARIDAD.md](./PLAN_MODULARIDAD.md)
> (en implementación) lo convierte en base white-label. Este plan propone las
> **mejoras y funcionalidades nuevas** que convierten esa base en un producto
> que se puede vender con confianza a bares y restaurantes: menos no-shows,
> mejor operativa de sala, y la fiabilidad necesaria para tener varios
> clientes en producción a la vez.
>
> Criterio de selección: máximo valor para el negocio del restaurante y para
> la venta del producto, apoyándose siempre que sea posible en lo que el
> código **ya tiene a medio modelar** (esfuerzo bajo, valor alto).

## 1. Resumen ejecutivo

**Las 5 mejoras con mejor relación valor/esfuerzo** (todas se apoyan en
estructuras que ya existen en el schema o en endpoints sin interfaz):

1. **Autogestión de reservas por el cliente** (cancelar/modificar por enlace) —
   `Booking.confirmationToken` ya existe y no se usa; hoy el email dice
   "llama al restaurante". Menos teléfono, menos no-shows.
2. **Recordatorio + reconfirmación automáticos** — `reconfirmToken`,
   `emailSentAt` y `reconfirmedAt` existen en el schema desde el principio y
   nunca se implementaron. Es LA feature anti no-show del sector.
3. **Gestión de personal desde el panel** — no existe CRUD de staff: hoy es
   imposible dar de alta un camarero sin tocar la BD a mano. Bloqueante real
   para entregar el producto a un cliente.
4. **Lista de espera funcional** — el modelo `Waitlist` (con `isResolved`,
   `notifiedAt`) existe completo y sin un solo endpoint.
5. **Rate limiting + captcha en la API pública** — pendiente heredado del plan
   de bugs (la ficha BUG-05 lo señalaba; solo se implementó la validación de
   config). Sin esto, cualquier script puede llenar la agenda de un cliente.

## 2. Priorización

| Nivel | Tema | Para qué sirve |
|---|---|---|
| **N1** | Anti no-show y autogestión | El argumento de venta nº 1 a un restaurante |
| **N2** | Operativa de sala en el panel | Que el personal VIVA en el panel a diario |
| **N3** | Web pública y captación | Más reservas y mejor presencia de cada cliente |
| **N4** | Plataforma multi-cliente | Fiabilidad/seguridad para operar varios clientes |
| **N5** | Apuestas opcionales | Decisiones de negocio, no técnicas |

Dependencia general: **este plan asume PLAN_MODULARIDAD.md terminado**
(config schema con caché, emails multiidioma, reglas de negocio en config,
seed parametrizado). Varias fichas lo aprovechan directamente.

---

## 3. N1 — Anti no-show y autogestión del cliente

### N1.1 Autogestión de reserva por enlace (cancelar / modificar)
- **Qué:** el email de confirmación incluye un botón "Gestionar mi reserva" →
  página pública `/reserva/:token` (sin login) donde el cliente ve su reserva
  y puede **cancelarla** o **cambiarla de hora** (contra la disponibilidad
  real). Al cancelar: la mesa se libera, el panel recibe el socket
  `reservation_cancelled` (ya existe) y se envía email de cancelación.
- **Por qué:** hoy el email dice literalmente que llames por teléfono. La
  autogestión reduce no-shows (cancelar es fácil → la gente cancela en vez de
  no aparecer) y quita trabajo al personal.
- **Apoyo existente:** `Booking.confirmationToken` (único e indexado) se
  genera en cada reserva y **no se usa para nada**. Los eventos socket y la
  validación de slots ya existen.
- **Cuidados:** el token es capacidad de acceso → solo por HTTPS, expira al
  completarse la reserva, y la página no muestra datos sensibles completos
  (email/teléfono enmascarados).
- **Esfuerzo:** 2-3 días.

### N1.2 Recordatorio y reconfirmación automáticos
- **Qué:** un job programado (node-cron en el propio backend) envía a las
  reservas CONFIRMED un email T-24h (configurable) con "Confirmo mi
  asistencia" / "Cancelar". Confirmar marca `RECONFIRMED` (estado ya existe
  en el enum y en las transiciones). Configurable por restaurante: horas de
  antelación, y si la falta de reconfirmación solo avisa al panel o
  auto-cancela a T-X horas.
- **Por qué:** es la medida anti no-show estándar del sector y el schema la
  dejó preparada (`reconfirmToken`, `emailSentAt`, `reconfirmedAt`, estado
  `RECONFIRMED`) sin implementar jamás.
- **Cuidados:** el job debe ser idempotente (`emailSentAt` evita duplicados)
  y tolerar reinicios; en multi-instancia futura, usar el advisory lock ya
  existente para no enviar por duplicado.
- **Esfuerzo:** 2-3 días (incluye claves de config nuevas + tests con reloj
  congelado, la infraestructura de test ya lo soporta).

### N1.3 Emails de ciclo de vida completos
- **Qué:** además de la confirmación (única que existe), plantillas para
  **cancelación** (por cliente o por restaurante), **modificación** (nueva
  fecha/hora) y **cierre sobrevenido** (el restaurante cancela un día con
  reservas → aviso masivo con disculpa y enlace para re-reservar).
- **Apoyo existente:** tras M5 las plantillas ya son multiidioma y con el
  tema del restaurante; esto es añadir 3 plantillas y llamarlas desde los
  puntos de mutación (que ya emiten sockets — mismos puntos).
- **Esfuerzo:** 1 día.

### N1.4 Lista de espera
- **Qué:** cuando el wizard no encuentra hueco, ofrece "Avísame si queda
  libre" (nombre + email + fecha + pax). Al cancelarse una reserva compatible,
  el primero de la lista recibe un email con enlace de reserva prioritaria
  que **expira** (p. ej. 2 h, configurable); si expira, pasa al siguiente.
  Pestaña de lista de espera en el panel.
- **Apoyo existente:** el modelo `Waitlist` completo (`isResolved`,
  `notifiedAt`, `resolvedAt`) está en el schema **sin un solo endpoint**; el
  perfil de cliente del panel ya intenta mostrarla.
- **Esfuerzo:** 3-4 días.

---

## 4. N2 — Operativa de sala

### N2.1 Gestión de personal (CRUD de staff) — **bloqueante para entregar**
- **Qué:** sección "Equipo" en el panel (solo ADMIN): alta/baja de personal,
  rol ADMIN/STAFF, activar/desactivar, reset de contraseña. Endpoint
  `POST/PATCH/DELETE /backoffice/staff`.
- **Por qué:** hoy el único usuario es el admin del seed; no hay forma de
  crear camareros sin SQL a mano. El sistema de roles y la re-verificación de
  `isActive` ya funcionan (plan de bugs BUG-03): solo falta el CRUD.
- **Cuidados:** no permitir desactivar/degradar al último ADMIN; política
  mínima de contraseñas; auditoría de quién crea a quién.
- **Esfuerzo:** 1-2 días.

### N2.2 Vista de sala (libro de reservas / timeline)
- **Qué:** vista grid **mesas × franjas del turno** del día: cada reserva es
  un bloque en su mesa y horario; arrastrar un bloque a otra mesa reasigna.
  Botón "Walk-in" que ocupa una mesa ahora mismo con datos mínimos.
- **Apoyo existente:** `POST /backoffice/bookings/:id/reassign` existe y **no
  tiene interfaz**; `BOOKING_SOURCE.WALK_IN` existe sin uso; dnd-kit ya es
  dependencia del frontend (se usa en la carta); los sockets ya refrescan.
- **Por qué:** es la vista con la que el personal de sala trabaja de verdad
  en los productos comerciales (CoverManager, TheFork Manager); la tabla
  actual sirve para consultar, no para operar un servicio.
- **Esfuerzo:** 4-6 días. La mejora más cara del plan y probablemente la más
  diferencial.

### N2.3 Hoja de servicio imprimible
- **Qué:** vista imprimible (CSS `@media print`) del turno de hoy: reservas
  ordenadas por hora con **alérgenos destacados**, VIP, notas y pax; botón
  "Imprimir servicio" en el dashboard.
- **Por qué:** la cocina y la sala siguen funcionando con papel; los
  alérgenos impresos son además un tema de responsabilidad.
- **Esfuerzo:** 1 día.

### N2.4 Métricas históricas
- **Qué:** pestaña "Informes": ocupación por día/semana, tasa de no-show,
  clientes nuevos vs recurrentes, horas pico, top clientes. Agregaciones SQL
  + gráficas ligeras (sin librería pesada; SVG propio o `recharts` si se
  acepta la dependencia). Selector de rango.
- **Por qué:** al dueño del restaurante le vendes "sabrás lo que pasa en tu
  local"; hoy el dashboard solo mira el día actual.
- **Esfuerzo:** 2-3 días.

### N2.5 Auditoría de cambios de reserva
- **Qué:** tabla `BookingEvent` (bookingId, tipo, quién, cuándo, snapshot del
  cambio) alimentada desde los puntos de mutación; timeline visible en el
  detalle de la reserva.
- **Por qué:** "¿quién movió esta mesa?" es LA discusión típica de un
  servicio; `assignedBy` se queda corto. Además da trazabilidad ante quejas.
- **Esfuerzo:** 1-2 días.

---

## 5. N3 — Web pública y captación

### N3.1 Calendario con disponibilidad real en el wizard
- **Qué:** sustituir el `<input type="date">` por un calendario que
  deshabilite días cerrados y marque días completos, usando un endpoint de
  disponibilidad mensual.
- **Apoyo existente:** `getAvailableDaysInMonth` quedó optimizado en el plan
  de bugs (≤5 queries por mes) y el endpoint público
  `GET /availability/calendar` existe en el backend; el frontend nunca lo usó
  (la función cliente se eliminó por código muerto). Es reconectar, no crear.
- **Por qué:** hoy el usuario elige un lunes y descubre después que está
  cerrado — fricción directa en el paso 1 del embudo.
- **Esfuerzo:** 1-2 días.

### N3.2 Selección de zona por el cliente
- **Qué:** paso opcional del wizard "¿Dónde prefieres sentarte?" (terraza /
  interior / barra…) si el restaurante tiene más de una zona activa.
  Configurable (hay locales que no quieren dar a elegir).
- **Apoyo existente:** toda la API pública ya acepta `zoneId`; el wizard
  nunca lo expone.
- **Esfuerzo:** 0,5-1 día.

### N3.3 Alérgenos y foto por plato en la carta
- **Qué:** campos `allergens String[]` y `photoUrl String?` en `MenuItem`
  (migración aditiva), editor en la carta del panel (con los 14 alérgenos UE
  como opciones), iconos en la carta pública.
- **Por qué:** el Reglamento (UE) 1169/2011 obliga a informar de alérgenos;
  ofrecerlo de serie es un argumento de venta y hoy el modelo no lo soporta
  (los alérgenos solo existen en el perfil del cliente).
- **Esfuerzo:** 2 días.

### N3.4 Petición de reseña post-visita
- **Qué:** al pasar una reserva a COMPLETED (o job nocturno), email "¿Qué tal
  todo?" con enlace directo a reseñar en Google (el `GOOGLE_PLACE_ID` ya está
  en la config). Activable por restaurante; máximo 1 por cliente cada N días.
- **Por qué:** cierra el círculo con la sección de reseñas que ya existe en
  la home; más reseñas → más reservas para el cliente.
- **Esfuerzo:** 1 día (reutiliza el scheduler de N1.2).

### N3.5 SEO por restaurante
- **Qué:** datos estructurados schema.org (`Restaurant` con horario derivado
  de turnos, geo, `acceptsReservations`), meta OG/description generados desde
  la config, sitemap.xml, y `hreflang` para los idiomas activos.
- **Por qué:** cada cliente quiere salir bien en Google; con la identidad ya
  en config (M1) esto se genera solo para todos los clientes.
- **Esfuerzo:** 1-2 días.

---

## 6. N4 — Plataforma multi-cliente

### N4.1 Rate limiting + captcha en la API pública — **pendiente heredado**
- **Qué:** `express-rate-limit` en `/api/public/*` y `/api/auth/login`
  (límites distintos), y Cloudflare Turnstile (gratuito, sin fricción) en el
  formulario de reserva, activable por config.
- **Por qué:** señalado en la ficha BUG-05 del plan de bugs y nunca
  implementado: hoy un script puede llenar la agenda o forzar credenciales
  sin ningún freno.
- **Esfuerzo:** 1 día.

### N4.2 Backups automáticos y restauración probada
- **Qué:** servicio de backup en el compose de prod (`pg_dump` diario a un
  volumen/carpeta, rotación N días), script `restore.sh`, y **prueba de
  restauración documentada** (un backup que no se ha restaurado nunca no es
  un backup). Documentar la variante Render (backups gestionados).
- **Por qué:** con clientes reales, perder la base de reservas es perder al
  cliente. Es lo primero que preguntará cualquiera que evalúe el producto.
- **Esfuerzo:** 1 día.

### N4.3 Logging estructurado y monitorización
- **Qué:** sustituir los `console.*` por `pino` (JSON, niveles, redacción de
  campos sensibles — la sanitización de contraseñas ya existe), request-id
  por petición, y Sentry **opcional** por env var (si no hay DSN, no-op).
  Uptime: instrucciones de healthcheck externo sobre `/health` (ya existe).
- **Por qué:** cuando el cliente llame con "ayer no funcionaba", hay que
  poder responder. El plan de bugs dejó esto anotado (BUG-26) al eliminar el
  winston fantasma.
- **Esfuerzo:** 1-2 días.

### N4.4 RGPD: exportación y supresión de clientes
- **Qué:** en la ficha de cliente del panel: "Exportar datos" (JSON/CSV de
  perfil + reservas) y "Anonimizar" (sustituye PII por placeholders
  conservando la estadística de reservas; no borra filas → no rompe
  integridad). Clave de config de retención (p. ej. anonimizar clientes sin
  actividad tras N meses, job del scheduler).
- **Por qué:** el sistema guarda PII real de comensales para terceros
  (los restaurantes son responsables del tratamiento); ofrecer esto de serie
  es diferencial y evita problemas legales a tus clientes.
- **Esfuerzo:** 2 días.

### N4.5 Aprovisionamiento de cliente en un comando
- **Qué:** encima del `NUEVO_RESTAURANTE.md` de M6: script
  `scripts/new-client.sh <fichero.seed.json>` que valida el fichero, crea la
  BD, aplica migraciones, siembra, y deja el compose listo con su `.env`
  generado (secretos aleatorios incluidos). Objetivo medible: **de cero a
  stack funcionando en <15 minutos**.
- **Esfuerzo:** 1-2 días.

### N4.6 PWA del panel
- **Qué:** manifest + service worker mínimo (sin caché agresiva de datos)
  para que el personal instale el panel en el móvil/tablet de sala con el
  icono del restaurante (favicon ya configurable tras M3).
- **Esfuerzo:** 1-2 días.

---

## 7. N5 — Apuestas (requieren decisión de negocio, no solo técnica)

| Mejora | Qué aporta | Coste/riesgo |
|---|---|---|
| **Señal/prepago (Stripe)** para grupos grandes o fechas señaladas | El anti no-show definitivo; estándar en el sector | Alta: pagos = PCI, reembolsos, soporte. Solo si un cliente lo pide |
| **Combinación de mesas** (asignar 2+ mesas contiguas a un grupo) | Acepta grupos mayores que la mesa más grande (hoy se rechazan) | El motor de asignación crece en complejidad; necesita "mesas combinables" en el modelo |
| **WhatsApp/SMS (Twilio)** para confirmación/recordatorio | En hostelería España, WhatsApp >> email | Coste por mensaje y alta de plantillas de WhatsApp Business por cliente |
| **Multi-tenant real** (varios restaurantes, una instancia) | Margen operativo si hay decenas de clientes | Ya descartado en PLAN_MODULARIDAD §7; solo re-evaluar con >10 clientes |

---

## 8. Orden recomendado y agrupación en goles

```
G-A (vendible):      N2.1 staff → N4.1 rate-limit → N1.3 emails → N3.1 calendario → N3.2 zona   (~5 días)
G-B (anti no-show):  N1.1 autogestión → N1.2 recordatorios → N3.4 reseñas → N1.4 lista espera   (~7 días)
G-C (operativa):     N2.3 hoja servicio → N2.5 auditoría → N2.4 métricas → N2.2 vista de sala   (~9 días)
G-D (plataforma):    N4.2 backups → N4.3 logging → N4.4 RGPD → N4.5 aprovisionamiento → N4.6 PWA (~7 días)
G-E (público):       N3.3 alérgenos carta → N3.5 SEO                                            (~3 días)
```

- **G-A primero**: son los huecos que un cliente detectaría la primera semana.
- G-B es el argumento de venta; G-C lo que fideliza al personal; G-D lo que
  te permite dormir con varios clientes en producción.
- Cada mejora entra con el estándar ya establecido: tests rojo→verde donde
  aplique, suites/lint/build verdes, claves nuevas por el config schema
  validado, textos por i18n, y sin romper la prueba de fuego white-label
  ("Bar Ejemplo" sigue montándose sin tocar `src/`).

## 9. Fuera de este plan

Reordenaciones estéticas sin valor funcional, reescrituras de framework,
apps nativas, integraciones con TheFork/Google Reserve (dependen de acuerdos
comerciales, no de código), y todo lo listado en N5 hasta que haya decisión
de negocio explícita.
