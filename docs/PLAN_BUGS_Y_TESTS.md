# Plan de corrección de bugs y estrategia de tests

> Documento generado a partir de un análisis exhaustivo del código (14-08-2026).
> Complementa a [ARCHITECTURE.md](./ARCHITECTURE.md) y [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md).
> El plan de modularización está en [PLAN_MODULARIDAD.md](./PLAN_MODULARIDAD.md).
>
> **Estado (14-08-2026): PLAN IMPLEMENTADO.** Las fases F1–F6 y T0–T5 están
> ejecutadas. Quedan pendientes solo las acciones externas del usuario de F1:
> rotar la credencial de la BD de Render y, opcionalmente, purgar el
> historial de git (los ficheros ya no están rastreados).

## 1. Resumen ejecutivo

El sistema funciona en su camino feliz, pero el análisis ha encontrado **fallos críticos de seguridad y de despliegue**, varios **bugs de lógica de negocio** en el motor de reservas (fechas/zonas horarias, fusión de clientes, cierres) y una **suite de tests rota y muy escasa** (5 de 12 tests de backend fallan hoy; el frontend tiene solo 9 tests y 17 errores de lint).

**Los 3 hallazgos más críticos:**

1. **Credenciales reales de la base de datos de producción versionadas en git** (`backend/seed-prod.sh:2`, y el `.env` raíz también está rastreado pese al `.gitignore`). El script además ejecuta un seed que **borra todas las tablas** (`backend/prisma/seed.ts:11-22`): cualquiera con el repo puede leer o destruir la BD de producción.
2. **`JWT_SECRET` con fallback público** (`backend/src/config/auth.js:1`, `'changeme-secret-key'`) y `docker-compose.prod.yml` no lo define: en un despliegue así, cualquiera puede forjar un token de ADMIN y controlar todo el back-office.
3. **DoS trivial desde el panel**: `PATCH /api/backoffice/shifts/:id` acepta `slotInterval: 0` sin validar (`backend/src/controllers/backoffice/shiftController.js:38`) y `generateTimeSlots` entra en **bucle infinito** (`backend/src/utils/dateHelpers.js:119-124`, verificado empíricamente: el proceso queda colgado). La siguiente consulta de disponibilidad bloquea el event loop y tumba toda la API.

## 2. Evidencia recogida (ejecutado el 14-08-2026)

| Verificación | Comando | Resultado |
|---|---|---|
| Tests backend | `cd backend && npx vitest run` | **5 fallidos / 7 pasados** (12 tests, 4 ficheros) |
| Tests frontend | `cd frontend && npx vitest run` | 9/9 pasados (3 ficheros) |
| Lint frontend | `npm run lint` | **17 errores, 1 warning** |
| Build frontend | `npm run build` | OK, pero bundle de **535 KB** (aviso de Vite) y aviso `/restaurant.jpg` no resuelto |
| Lint/typecheck backend | — | **No existe** script de lint ni typecheck en `backend/package.json` |

Los 5 tests de backend que fallan lo hacen todos por la misma causa: **fechas hardcodeadas ya pasadas** (`'2026-05-01'` en `backend/src/tests/services/availabilityService.test.js:39,53` y `backend/src/tests/reservation.test.js:23,63`; `getAvailableDaysInMonth(2026, 4, 2)` en `availabilityService.test.js:22`). `isDateInBookableRange` las rechaza y las aserciones (`201`, `available: true`, mensajes) no se cumplen. La suite no congela el reloj (`vi.setSystemTime`) ni fija la TZ, así que **caduca sola con el paso del tiempo**.

Verificaciones empíricas adicionales (ejecutadas con Node sobre el código real):

- `TZ=Europe/Madrid`: `isDateInBookableRange(hoy+30)` → `false` aunque `MAX_DAYS_AHEAD=30` (off-by-one, ver BUG-07).
- `TZ=America/New_York`: `isDateInBookableRange(hoy)` → `false` (no se puede reservar ni para hoy, ver BUG-04).
- `combineDateAndTime('2026-09-01','14:00')` produce `14:00Z` con `TZ=UTC` y `12:00Z` con `TZ=Europe/Madrid` (la hora almacenada depende de la TZ del proceso).
- `generateTimeSlots('13:00','16:00', 0)` → bucle infinito (proceso matado por timeout).

## 3. Inventario de bugs

Severidad: 🔴 Crítico · 🟠 Alto · 🟡 Medio · ⚪ Bajo

### 3.1 Seguridad

| ID | Sev. | Dónde | Problema |
|---|---|---|---|
| BUG-01 | 🔴 | `backend/seed-prod.sh:2`, `.env` (raíz) | Credenciales de PostgreSQL de producción (Render) en texto plano y **rastreadas por git** (`git ls-files` lo confirma; `.env` se añadió antes de la regla de `.gitignore:2`). El script encadena `prisma db push --accept-data-loss` + seed destructivo (`backend/prisma/seed.ts:11-22` hace `deleteMany()` de todas las tablas). **Acción:** rotar credenciales ya, sacar ambos ficheros del índice y purgar el historial. |
| BUG-02 | 🔴 | `backend/src/config/auth.js:1`, `docker-compose.prod.yml:31-34` | `JWT_SECRET` cae a `'changeme-secret-key'` si falta la env var, y el compose de producción no la define → tokens de ADMIN forjables. El arranque debería **fallar** si falta el secreto en producción. |
| BUG-03 | 🟠 | `backend/src/middleware/authMiddleware.js:11-43`, rutas `backend/src/routes/**` | No existe autorización por roles: el enum `StaffRole` (`backend/prisma/schema.prisma:202`) no se comprueba en ninguna ruta (grep de `role` en routes/middleware: 0 resultados). Cualquier STAFF puede borrar zonas, cambiar configuración o reasignar todo. Además el middleware no re-verifica `isActive`: una cuenta desactivada sigue operando hasta que caduque su token (8 h). |
| BUG-05 | 🟠 | `backend/src/index.js:97-100`, `backend/src/controllers/backoffice/configController.js:22-31` | Sin rate limiting ni captcha en los endpoints públicos (reservas spam ilimitadas) y `PATCH /backoffice/config` hace upsert de **claves arbitrarias sin validación**: un `opening_days` corrupto (p. ej. `"abc"`) hace que `getOpeningDays` devuelva `[NaN]` y el restaurante aparezca **cerrado todos los días** (`backend/src/services/availabilityService.js:351-361`). |
| BUG-06 | 🟡 | `backend/src/middleware/errorHandler.js:8-14` | El manejador global loguea `req.body` completo: los errores en `/api/auth/login` dejan **contraseñas en claro en los logs**. |
| BUG-27 | 🟡 | `README.md:53-54`, `backend/prisma/seed.ts:29-41` | Credenciales demo (`admin@mesonmarinero.com` / `admin1234`) publicadas en el README y sembradas por defecto; si el seed se ejecuta en el despliegue real (como hace `seed-prod.sh`), el panel de producción queda con esa cuenta pública. |
| BUG-28 | 🟡 | `docker-compose.prod.yml:8-11,64-67` | Contraseñas por defecto `root` para Postgres y pgAdmin si no se exportan las env vars, con **Postgres publicado en el host (`5433`)** y pgAdmin en `5050` también en producción. |
| BUG-37 | 🟡 | `backend/prisma/seed.ts:118-249` | El seed contiene **datos personales aparentemente reales** (emails corporativos, teléfonos móviles reales, nombres) de 12 "clientes demo", versionados en git y sembrados en la BD de producción por `seed-prod.sh`. Riesgo RGPD; sustituir por datos sintéticos (faker). |

### 3.2 Lógica de reservas, fechas y zona horaria

| ID | Sev. | Dónde | Problema |
|---|---|---|---|
| BUG-04 | 🔴 | `backend/src/utils/dateHelpers.js:27,34`, `docker-compose.prod.yml:31-34` | Todo el motor de fechas depende de la TZ del proceso (`combineDateAndTime` parsea hora local) y **producción no define `TZ`** (el compose de dev sí: `docker-compose.yml:37`). En UTC, las reservas se guardan desplazadas 2 h, la antelación mínima se calcula mal y los emails muestran otra hora. Con TZ al oeste de UTC no se puede reservar ni para hoy (verificado). No hay ningún check de TZ al arrancar. |
| BUG-07 | 🟠 | `backend/src/utils/dateHelpers.js:78-91` | `isDateInBookableRange` mezcla parseo UTC (`new Date('YYYY-MM-DD')`) con aritmética local: el **día +30 siempre se rechaza** aunque `MAX_DAYS_AHEAD=30` y el mensaje prometa "hasta 30 días" (verificado empíricamente). Mismo patrón de parseo mixto en `validateBookingDate` (`backend/src/services/validationService.js:96`). |
| BUG-08 | 🟠 | `backend/src/services/availabilityService.js:413-441` | `findAlternativeTimes` sugiere horas **sin validar que pertenezcan a un turno ni que estén alineadas al slot**: la sugerencia "−30 min" puede ser anterior a la apertura y el usuario que la acepta recibe un 409 (`INVALID_BOOKING_SLOT`) al confirmar. Cerca de medianoche, `addMinutes` + `toTimeString` (`:418-420`) cambia de día silenciosamente y la hora sugerida corresponde a otra fecha. |
| BUG-09 | 🟠 | `backend/src/services/customerService.js:22-97`, `backend/src/controllers/reservationController.js:48-63` | `findOrCreateCustomer` empareja por **teléfono** además de email y luego **sobrescribe email y nombre del cliente encontrado**: reservar con el teléfono de otra persona secuestra su ficha (las confirmaciones futuras van al nuevo email); si el nuevo email ya pertenece a otro cliente, el `update` viola el unique y la reserva falla con 409 confuso. Además se llama **antes** de la transacción de disponibilidad, así que un intento fallido incrementa `totalVisits` y contamina el historial CRM. |
| BUG-10 | 🟠 | `backend/prisma/seed.ts:262` vs `backend/prisma/seed.ts:56,64` | `opening_days = '1,3,5,6,0'` contradice los `daysOfWeek: [0,2,3,4,5,6]` de los turnos: los lunes aparecen "abiertos" sin turnos, y los **martes y jueves hay turnos pero el día está bloqueado**. Dos fuentes de verdad para "días de apertura" que el código consulta por separado (`availabilityService.js:53-67`). |
| BUG-11 | 🟠 | `backend/src/services/availabilityService.js:33-42` vs `backend/src/controllers/backoffice/closureController.js:13-19` | Semántica de `endDate = null` inconsistente: para la disponibilidad significa "cierre indefinido" (un cierre de un día sin `endDate` **cierra el restaurante para siempre** a partir de esa fecha), pero para el listado del back-office significa cierre puntual. Además un cierre con `isFullDay: false` y sin `shiftId` no bloquea nada (`isShiftBlockedByClosure`, `:44-48`). |
| BUG-12 | 🟠 | `backend/src/controllers/backoffice/bookingController.js:406-452` | `updateBookingStatus` no valida transiciones (COMPLETED → PENDING posible) y el incremento de `totalNoShows` **no es idempotente**: marcar NO_SHOW dos veces cuenta dos no-shows. La otra vía de cambio de estado (`PATCH /:id`, `:341-350`) no incrementa nada: dos rutas con efectos distintos para la misma operación. |
| BUG-13 | 🟠 | `backend/src/controllers/backoffice/zoneController.js:110-131`, `backend/prisma/schema.prisma:84,98,112` | `DELETE` de mesa/zona es **borrado físico**; `Booking.tableId` es opcional → Prisma aplica `SetNull` y las **reservas futuras activas se quedan sin mesa** sin aviso: desaparecen del plano y la disponibilidad deja de contarlas (riesgo de overbooking). Borrar una zona cascada a todas sus mesas y multiplica el efecto. |
| BUG-14 | 🟡 | `backend/src/controllers/backoffice/bookingController.js:287-302` | Editar el `pax` de una reserva re-valida el slot **con la antelación mínima de cliente** (`meetsMinimumAdvanceTime`): el staff no puede ajustar comensales de una reserva que empieza en menos de 2 h (caso operativo habitual). |
| BUG-15 | 🟡 | `backend/src/services/tableAssignmentService.js:8-15`, migración `20260427120000_prevent_overlapping_bookings` | El lock advisory usa **una única clave global**: serializa todas las reservas del sistema (cuello de botella innecesario; bastaría lock por mesa o por franja). Si aun así el constraint de exclusión salta, el error de Postgres (23P01) no está mapeado en `handlePrismaError` (`backend/src/middleware/errorHandler.js:55-91`) → el cliente recibe un 500 `DATABASE_ERROR` en vez de un 409 amable. |
| BUG-16 | 🟡 | `backend/src/controllers/reservationController.js:89` | Rama muerta peligrosa: `assignment.type === 'SINGLE' ? ... : assignment.tables[0].id` — `assignOptimalTable` solo devuelve `SINGLE`; si algún día devuelve otro tipo, `assignment.tables` es `undefined` y revienta. Igual en `bookingController.js:207-209`. |
| BUG-17 | 🟡 | `backend/src/controllers/backoffice/shiftController.js:25-52` | `updateShift` no valida `startTime`/`endTime` (formato `HH:mm`), ni `daysOfWeek` (enteros 0-6), ni `slotInterval > 0` (ver hallazgo crítico nº 3 del resumen). Valores corruptos rompen silenciosamente toda la disponibilidad (`timeToMinutes` → `NaN`). |

### 3.3 Tiempo real, email e integraciones

| ID | Sev. | Dónde | Problema |
|---|---|---|---|
| BUG-18 | 🟠 | `backend/src/controllers/reservationController.js:104` (único emit) | Solo la reserva pública emite el socket `new_reservation`. Las altas del back-office, cambios de estado, ediciones y cancelaciones **no emiten nada** → el "panel en tiempo real" (ARCHITECTURE.md:58) queda desincronizado entre dos operadores. |
| BUG-19 | 🟡 | `backend/src/services/emailService.js:6-7` | `secure: process.env.SMTP_PORT == 465` con `SMTP_PORT` sin definir evalúa `false` mientras el puerto cae a 465 → nodemailer intenta STARTTLS contra un puerto TLS-directo y el envío falla/cuelga con la configuración por defecto. |
| BUG-20 | 🟡 | `backend/src/controllers/reservationController.js:116` | Email de confirmación *fire-and-forget* sin `.catch()` externo: cualquier excepción síncrona previa al `try` interno (p. ej. `booking.date` inválido en `emailService.js:122`) es un unhandled rejection que **tumba el proceso** después de haber confirmado la reserva. No existen emails de cancelación/modificación (ARCHITECTURE.md:57 promete "confirmación, reconfirmación y recordatorio"). |
| BUG-21 | 🟡 | `backend/src/controllers/reviewsController.js:62-79` | Las reseñas de Google se piden a la API **en cada visita pública, sin caché** (coste, cuota y latencia). El bloque mock (`:16-58`) y el fallback (`:92-117`) son duplicados literales parciales. |

### 3.4 Rendimiento

| ID | Sev. | Dónde | Problema |
|---|---|---|---|
| BUG-22 | 🟠 | `backend/src/services/availabilityService.js:167-213,366-408` | Explosión N+1: `getAvailableDaysInMonth` consulta la BD por **día × turno × slot × mesa** (con 15 mesas y 2 turnos, miles de queries por petición de calendario). `isTableFreeAtTime` además no acota por fecha inferior (`:393`, solo `date < endTime`): carga todo el histórico de reservas de la mesa en cada comprobación. |
| BUG-23 | 🟡 | `backend/src/controllers/backoffice/bookingController.js:53-69` | `getAllBookings` trae **todos** los ids que casan con el filtro a memoria y pagina en JavaScript; sin filtro de fecha, cada petición del listado carga la tabla entera. |
| BUG-24 | 🟡 | `frontend` build | Bundle único de 535 KB (sin code-splitting por ruta: el visitante público descarga todo el panel admin). `dist` avisa además de `/restaurant.jpg` referenciado y no resuelto en build. |

### 3.5 Calidad de código y tooling

| ID | Sev. | Dónde | Problema |
|---|---|---|---|
| BUG-25 | 🟠 | `backend/src/tests/**` | Suite rota: 5/12 tests fallan por fechas hardcodeadas caducadas (ver §2). Sin reloj congelado, sin TZ fijada, sin CI que lo detecte. |
| BUG-26 | 🟡 | `backend/package.json:24,26,37`, `backend/src/tests/setup.js:4` | `joi` y `winston` declarados y **nunca usados** (ARCHITECTURE.md:19 afirma validación con Joi); los tests mockean `../utils/logger`, que **no existe**; hay 52 llamadas `console.*` en `src/` en lugar de un logger. |
| BUG-29 | 🟡 | `.gitignore:70`, `.gitignore:10` | El patrón `migrations/` (sin anclar) hará que **cualquier migración nueva de Prisma se ignore silenciosamente** → producción divergirá del código en el próximo `migrate deploy`. `package-lock.json` también está ignorado: builds no reproducibles. |
| BUG-30 | 🟡 | `docker-compose.prod.yml:44-51`, `backend/Dockerfile:19,25` | Despliegue prod roto: referencia `frontend/Dockerfile` **inexistente** (solo hay `Dockerfile.dev`); `VITE_API_URL` se inyecta en *runtime* cuando Vite la necesita en *build-time* (y apunta a `localhost`); el backend corre `npm run dev` (nodemon) en producción; `CORS` queda apuntando a `http://localhost:5173` (sin `FRONTEND_URL`); la imagen fija un `DATABASE_URL` dummy que enmascara errores de configuración. |
| BUG-31 | ⚪ | `backend/src/controllers/backoffice/zoneController.js:36-47,68-82`, `menuController.js:27-38,68-81` | Altas sin validación: `name` ausente o `categoryId` no numérico acaban en error Prisma → 500 `DATABASE_ERROR` en vez de 400; se puede crear una mesa con `minCapacity > maxCapacity` (jamás asignable). |
| BUG-32 | ⚪ | `backend/src/services/configService.js:72-75`, `backend/src/services/emailService.js:147` | Fusión de config con `\|\|` en vez de `??`: un valor vaciado a propósito (`''`) revierte silenciosamente al default hardcodeado. |
| BUG-33 | ⚪ | `testapi.sh:173,210,225` | El script de pruebas manuales referencia datos de seed que ya no existen (`Mesa S-1`, `cliente@normal.com`, `blacklisted@bad.com`): la mitad de los casos fallan por datos, no por bugs. |

### 3.6 Frontend

#### Sesión, API y tiempo real

| ID | Sev. | Dónde | Problema |
|---|---|---|---|
| BUG-38 | 🟠 | `frontend/src/components/admin/ProtectedRoute.tsx:10-13` | La "protección" solo comprueba que **exista una cadena** en `localStorage` (`admin_token`): no valida expiración, firma ni llama a `/auth/me`. Cualquier valor puesto a mano renderiza todo el panel; con token caducado se monta el layout y el socket con un token muerto, mostrando "Cargando..." hasta que un 401 expulsa al usuario. Tampoco preserva la ruta de destino (siempre vuelve al dashboard, `LoginPage.tsx:22`). |
| BUG-39 | 🟠 | `frontend/src/context/SocketContext.tsx:12-24` | El socket se crea en un `useMemo` (no garantizado estable; en `StrictMode` se crean instancias huérfanas sin `disconnect()`) y el token de auth **se congela al montar** (`:13`): tras re-loguearse, el socket sigue con el token viejo → `connect_error` permanente. `isConnected`/`connectionError` no se consumen en ninguna página → el admin cree tener tiempo real cuando el socket está caído. |
| BUG-40 | 🟠 | `frontend/src/services/api.ts:43-47`, `:25-28` | El interceptor de 401 hace `window.location.href = '/admin/login'` para **todas** las peticiones, incluidas las públicas (un 401 espurio expulsa a un visitante anónimo hacia el login del admin). La instancia axios no define `timeout`: con el backend colgado, todos los spinners quedan indefinidamente y los botones `disabled` para siempre. |
| BUG-41 | 🟡 | `frontend/src/services/api.ts:88-92`, `:59-64`, ~17 funciones sin tipo de retorno | `getAvailableTimes` **fabrica** `available: true` para todos los slots (el campo no aporta información real); `getAvailableCalendar` está exportada pero **nunca se usa** (el calendario público no marca días cerrados y el usuario se entera al no ver horarios); múltiples funciones devuelven `data.data` como `any` → los cambios de contrato del backend pasan el `tsc` y explotan en runtime. |

#### Flujo público de reserva

| ID | Sev. | Dónde | Problema |
|---|---|---|---|
| BUG-42 | 🟠 | `frontend/src/components/reservation/Step1DateTime.tsx:12`, `:29-45` | "Hoy" se calcula con `toISOString()` (**UTC**): de madrugada en Madrid el `min` del input permite seleccionar **ayer**. Los cambios rápidos de `pax`/fecha no cancelan la petición anterior (sin `AbortController`): una respuesta obsoleta puede pintar horarios de otro pax. |
| BUG-43 | 🟠 | `frontend/src/components/reservation/Step2User.tsx:32-58`, `:27-28`, `:48` | El submit solo se protege con `disabled={loading}`: un doble clic antes del re-render dispara `createReservation` dos veces → **reserva duplicada** (no hay clave de idempotencia). Validación cliente débil: email = `includes('@')`, teléfono = no vacío; `allergies.split(',')` sin `.filter(Boolean)` persiste alérgenos vacíos. |
| BUG-44 | 🟠 | `frontend/src/components/reservation/Step3Success.tsx:70`, `:13-20` | Teléfono de cancelación **hardcodeado** `+34 912 345 678`, distinto del `restaurant_phone` de config (`965 00 00 00`) → el cliente llama a un número erróneo. La fecha/hora de la reserva se formatea con la TZ **del navegador**: un cliente con el dispositivo en otra zona ve una hora distinta a la reservada. |
| BUG-45 | 🟠 | `frontend/src/context/ConfigContext.tsx:23-27`, `frontend/src/components/Navbar.tsx:88`, `frontend/src/App.tsx:21-63` | La fusión `{...DEFAULT_PUBLIC_CONFIG, ...data}` deja pasar `null` del backend, y `Navbar` hace `config.restaurant_phone.replace(...)` → `TypeError`. Como **no hay ningún `ErrorBoundary`** en toda la app, el resultado es pantalla en blanco. Si `/public/config` falla, la web muestra indefinidamente los datos hardcodeados del "Mesón Marinero" como si fueran reales. |

#### Panel de administración

| ID | Sev. | Dónde | Problema |
|---|---|---|---|
| BUG-46 | 🟠 | `frontend/src/pages/admin/CartaPage.tsx:562-617`, `:160` | El editor de "Platos Destacados" hace copias superficiales (`[...items]` y muta `newItems[idx].image`) del estado inicializado con `DEFAULT_SPECIALTIES` → **muta la constante importada del módulo** (`constants/publicConfig.ts:3`): tras abrir el editor y cancelar, el fallback global queda corrompido para toda la sesión. |
| BUG-47 | 🟠 | `frontend/src/pages/admin/ConfiguracionPage.tsx:29-33`, `:60-65`, `:330-377` | Si la carga de config falla, no hay estado de error: la página muestra los defaults del restaurante ficticio como datos reales, y "Editar → Guardar" los **escribe en la BD del cliente**. Además no valida que quede al menos un día de apertura (guardar `opening_days: ""` cierra el restaurante público sin aviso) ni que `startTime < endTime` en los turnos. |
| BUG-48 | 🟠 | `frontend/src/pages/admin/ReservasPage.tsx:41`, `CustomersPage.tsx:33,213` | `limit: 100` fijo y el `total` de la API se descarta: con más de 100 reservas/clientes en el rango, el resto es **invisible sin ningún indicio** (el pie de clientes muestra un total falso). La API soporta paginación; la UI no la usa. |
| BUG-49 | 🟡 | `frontend/src/pages/admin/DashboardPage.tsx:18,34-47` | Cada evento de socket relanza `fetchDashboard()` con `setLoading(true)`: cada reserva entrante sustituye la tabla por "Cargando..." (parpadeo continuo) y N eventos disparan N fetches sin control de concurrencia (respuestas fuera de orden pintan datos viejos). |
| BUG-50 | 🟡 | `frontend/src/pages/admin/ReservasPage.tsx:51`, `MesasPage.tsx:36-42`, `CartaPage.tsx:162-174` | Los banners de error **nunca se limpian** en éxito (`setError('')` ausente): un fallo transitorio deja el error rojo pegado para siempre. En paralelo, los botones "Guardar" de MesasPage (`:279,326`) y CartaPage (`:467,518,633`) no se deshabilitan durante el envío → doble clic crea **zonas/mesas/platos duplicados**. |
| BUG-51 | 🟡 | `frontend/src/styles/index.css:130-138`, `:95-105`, `frontend/src/services/useReveal.ts` | `body * { transition: none !important; animation: none !important; }` **mata todas las animaciones**: los spinners del panel son emojis estáticos (no se distingue "cargando" de "colgado") y todo el sistema de reveal con `IntersectionObserver` es código muerto que sigue instanciando observers. |
| BUG-52 | 🟡 | `frontend/src/components/admin/CustomerDetailsModal.tsx:30-44`, `:129`, `:186-211` | Fetch sin `AbortController` (cambiar de cliente rápido pinta datos del anterior), `prompt()` nativo para el motivo de blacklist (bloqueante; en algunos contextos devuelve `null` y la acción se aborta en silencio) y el overlay cierra con clic **descartando cambios sin confirmar**. |
| BUG-53 | 🟡 | Panel admin completo + `frontend/src/constants/reservationStatus.ts:3-11` | **0 % del panel admin usa i18n** (ningún fichero de `pages/admin/` importa `react-i18next`; locales `es-ES` fijos en fechas) y las etiquetas de estado están en español fijo. En la zona pública hay fugas: `Navbar.tsx:39` hardcodea "Alicante, Mediterráneo" pese a existir la clave `navbar.location` traducida en los 3 locales, y `Specialties.tsx:41` resuelve el texto del botón con un ternario por idioma. |
| BUG-54 | ⚪ | Lint (17 errores, ver §2) | `setState` en efectos (`MesasPage.tsx:45`, `CartaPage.tsx:177`, `Step1DateTime.tsx:31`, `ThemeContext.tsx:30`), 9 `catch (err)` con el error silenciado (`MesasPage.tsx:69,82,105,118`, `CartaPage.tsx:231,261,274,299,312`), dependencia ausente (`CustomersPage.tsx:57`), `prefer-as-const` (`CartaPage.tsx:63`), exports mixtos que rompen Fast Refresh (`ConfigContext.tsx:46`, `ThemeContext.tsx:64`). |
| BUG-55 | ⚪ | `frontend/src/styles/pages/ReservationPage.css:41`, `frontend/src/context/ThemeContext.tsx:15-31`, `frontend/src/pages/admin/ConfiguracionPage.tsx:87-94` | Varios menores: `url('/restaurant.jpg')` apunta a un archivo **inexistente** (el aviso del build de §2); pasar por `/admin/login` fuerza `theme='light'` y el modo oscuro guardado no se restaura al re-entrar; la página de configuración muestra una "Versión API 2.4.0" y una "duración media 90–120 min" **inventadas** (hardcodeadas). |

### 3.7 Discrepancias documentación ↔ código

| Dónde | Afirmación | Realidad |
|---|---|---|
| `docs/ARCHITECTURE.md:19` | "validaciones (Joi)" | Joi no se usa en ningún fichero. |
| `docs/ARCHITECTURE.md:47-49` | La reserva se crea `PENDING` y devuelve token de confirmación | Se crea directamente `CONFIRMED` (`reservationController.js:85`); el token se genera pero **no hay endpoint de confirmación** que lo use. |
| `docs/ARCHITECTURE.md:57` | Emails "de confirmación, reconfirmación y recordatorio" | Solo existe `sendBookingConfirmation`; `reconfirmToken`/`emailSentAt` del schema están muertos. |
| `docs/FEATURES.md:9` | "El sistema recuerda el idioma preferido del cliente" | `Customer.language` nunca se escribe ni se lee; los emails son siempre en español. |
| `docs/FEATURES.md:20` | "límites de comensales" por turno | `Shift.maxBookingsPerSlot` no se consulta en ninguna parte (grep: 0 usos). |
| `docs/FEATURES.md:21` | "Cierres Temporales" como funcionalidad | El backend los implementa pero **no hay UI** (grep de `closure/cierre` en `frontend/src`: 0 resultados) ni los usa `testapi.sh`. |

## 4. Plan de tests

Estado actual: 12 tests backend (5 rotos), 9 tests frontend, 0 E2E, sin CI. Objetivo: una pirámide mínima pero fiable que cubra los flujos críticos (reservas, disponibilidad, asignación de mesas, autenticación) y que no caduque con el calendario.

### Fase T0 — Estabilizar la suite existente
- Congelar el reloj en todos los tests (`vi.setSystemTime`) y fijar `TZ=Europe/Madrid` en la config de vitest (`test.env`), sustituyendo las fechas literales por fechas relativas al reloj congelado (`availabilityService.test.js`, `reservation.test.js`).
- Añadir scripts `lint` (eslint) al backend y asegurarse de que `npm test` propaga el exit code.
- **Hecho cuando:** `npx vitest run` pasa 12/12 en cualquier fecha del calendario y en cualquier TZ del host.

### Fase T1 — Unit tests de servicios críticos (backend)
Objetivo de cobertura: ≥ 80 % de líneas en `src/services` y `src/utils`.
- `dateHelpers`: límites de `isDateInBookableRange` (hoy, +30, +31 — hoy cubre BUG-07), `meetsMinimumAdvanceTime`, `generateTimeSlots` con `interval <= 0` (cubre el DoS), comportamiento bajo distintas TZ.
- `availabilityService`: matching de turnos (primer/último slot), cierres (día completo, por turno, `endDate` nulo — cubre BUG-11), sugerencias dentro de turno (cubre BUG-08), `opening_days` corrupto (cubre BUG-05).
- `tableAssignmentService`: scoring/orden, exclusión de solapes con `excludeBookingId`, capacidades límite.
- `validationService`: emails, teléfonos, pax dinámico, sanitización.
- `customerService.findOrCreateCustomer`: matching por email vs teléfono, colisión de email único, no-incremento de `totalVisits` en reservas fallidas (cubre BUG-09; primero decidir la corrección).
- **Hecho cuando:** los tests nuevos fallan sobre el código actual en los BUGs citados y pasan tras cada corrección (rojo → verde documentado).

### Fase T2 — Integración de API (backend + Postgres real)
- Levantar Postgres efímero (servicio de docker compose o testcontainers) y ejecutar migraciones + seed de test mínimo, sustituyendo el mock global de Prisma para esta capa.
- Casos: flujo completo `availability/times → POST /reservations` (201 y payload), doble reserva concurrente sobre la misma mesa (el constraint `booking_no_table_overlap` debe traducirse a 409, cubre BUG-15), reserva de cliente blacklisted (403), login + acceso a `/backoffice` sin/CON token, expiración, edición de reserva y cambio de estado (idempotencia de `NO_SHOW`, cubre BUG-12), borrado de mesa con reservas futuras (cubre BUG-13).
- **Hecho cuando:** la suite de integración corre verde de forma reproducible con `docker compose` y cubre los 6 casos listados.

### Fase T3 — Unit/render tests de frontend
- `services/api.ts` con MSW: inyección del token, manejo de 401 (redirección/limpieza), timeouts.
- `ProtectedRoute`: sin token, token caducado, rol.
- Wizard de reserva completo (`Step1DateTime` → `Step2User` → `Step3Success`): carga de calendario/horas, doble submit, errores de API visibles.
- `ConfigContext`: fallback a defaults cuando `/public/config` falla.
- **Hecho cuando:** `npm run lint` da 0 errores y `npx vitest run` cubre esos 4 bloques (≥ 25 tests de frontend).

### Fase T4 — E2E con Playwright
- Escenarios mínimos: (1) reserva pública completa desde la home hasta la pantalla de éxito; (2) login admin + ver la reserva creada en Reservas; (3) cambio de estado y verificación del refresco en tiempo real (dos pestañas, cubre BUG-18); (4) intento de reserva en día cerrado.
- Ejecutar contra `docker-compose.yml` con seed determinista.
- **Hecho cuando:** los 4 escenarios pasan en local y en CI (headless).

### Fase T5 — CI
- GitHub Actions: job único con matriz backend/frontend → install, lint, test, build; job E2E opcional nightly. Bloquear merge si algo falla.
- **Hecho cuando:** un push con un test roto aparece en rojo en el PR.

## 5. Plan de corrección por fases

Orden pensado para reducir riesgo primero y apoyarse en los tests de §4 (cada corrección entra con su test).

| Fase | Contenido | Criterio de "hecho" |
|---|---|---|
| **F1 — Urgencias de seguridad** (independiente del resto) | BUG-01 (rotar credenciales, purgar git, `git rm --cached .env backend/seed-prod.sh`), BUG-02 (fail-fast sin `JWT_SECRET`), BUG-29 (arreglar `.gitignore`), BUG-27 (no sembrar admin demo en prod / forzar cambio de contraseña) | Credenciales antiguas revocadas; el backend no arranca en producción sin secreto propio; una migración nueva aparece en `git status`. |
| **F2 — Estabilizar tests** | Fase T0 completa + BUG-25 | 12/12 verdes en cualquier fecha. |
| **F3 — Bugs críticos de lógica** | BUG-04 (TZ explícita + check de arranque), BUG-17/DoS (validar turnos), BUG-07, BUG-13 (impedir borrado con reservas futuras o reasignar), BUG-05 (whitelist + validación de claves de config), BUG-10 (unificar días de apertura) | Tests T1/T2 correspondientes en verde; imposible dejar `slotInterval <= 0`; día +30 reservable. |
| **F4 — Bugs altos de negocio y de UI** | Backend: BUG-08, BUG-09, BUG-11, BUG-12, BUG-14, BUG-18, BUG-03. Frontend: BUG-38 (validar sesión real), BUG-39 (socket con token vivo), BUG-42/43/44 (wizard de reserva), BUG-45 (ErrorBoundary + fusión de config), BUG-46/47 (corrupción de config desde el panel) | Tests T1/T2/T3 en verde; panel sincronizado entre dos sesiones; imposible duplicar reserva con doble clic. |
| **F5 — Infra y despliegue** | BUG-30 (Dockerfile prod frontend + build args, `npm start`, `FRONTEND_URL`), BUG-28, BUG-37 (seed sintético), BUG-19/20/21 | `docker compose -f docker-compose.prod.yml up --build` levanta el stack completo funcional sin editar ficheros. |
| **F6 — Rendimiento y limpieza** | BUG-22 (precargar reservas del día en una query), BUG-23 (paginar en SQL), BUG-24 (code-splitting admin), BUG-40/41, BUG-48/49/50/51/52 (UX del panel), BUG-53 (i18n del panel), BUG-06, BUG-16, BUG-26, BUG-31…33, BUG-54/55, discrepancias de docs | Lint 0 errores en ambos paquetes; calendario de disponibilidad < 10 queries por petición; docs actualizados. |

---

*Todo el acoplamiento al restaurante concreto detectado durante este análisis (identidad, contenidos, tema, seed, idiomas, infraestructura) se trata por separado en [PLAN_MODULARIDAD.md](./PLAN_MODULARIDAD.md).*
