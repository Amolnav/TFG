# Plan de modularización — convertir el proyecto en una base "white-label"

> Objetivo: que adaptar el sistema a **otro restaurante o bar** (nombre, marca, carta, horarios, idiomas, tema) sea un ejercicio de **configuración y datos**, nunca de tocar código de negocio.
> Documento generado a partir de un análisis exhaustivo del código (14-08-2026). Los bugs funcionales están en [PLAN_BUGS_Y_TESTS.md](./PLAN_BUGS_Y_TESTS.md); aquí solo se trata el acoplamiento.

## 1. Resumen ejecutivo

La arquitectura de datos ya es genérica (el esquema Prisma no tiene nada "marinero" y la carta, zonas, mesas y turnos viven en BD), pero la **identidad del restaurante está repartida en al menos 7 fuentes de verdad distintas y contradictorias**, y una gran parte del contenido visible (marketing, horarios mostrados, panel admin, emails, mensajes de la API) está hardcodeada.

**Los 3 hallazgos más importantes:**

1. **Identidad duplicada y contradictoria en 7 sitios**: `systemConfig` en BD (seed), `backend/src/config/publicConfig.js`, `frontend/src/constants/publicConfig.ts` (duplicado literal), `backend/src/services/emailService.js:14-16` (¡otra dirección y otro teléfono!), los locales JSON, `frontend/index.html` y textos sueltos en componentes. Hoy conviven **tres direcciones** (Calle del Puerto 12 - Alicante / Calle Mayor 123 - Puerto de Santa María / Calle del Mar 123 - Madrid) y **tres teléfonos** (965 00 00 00 / 956 00 00 00 / +34 912 345 678, este último en la pantalla de éxito de reserva: `frontend/src/components/reservation/Step3Success.tsx:70`).
2. **El mecanismo de configuración ya existe pero cubre solo 5 claves**: `SystemConfig` (key-value en BD) + `GET /api/public/config` + `ConfiguracionPage` funcionan, pero solo para `restaurant_name/address/phone/email` y `specialties_config`. Todo lo demás — horarios que se muestran al público, historia, valores, testimonios de fallback, imágenes, colores, tipografías, redes sociales, reglas de negocio (duraciones, antelaciones, aforo) — está en constantes de código o en los JSON de idioma.
3. **No hace falta multi-tenant**: no existe modelo `Restaurant`/`tenantId` en el esquema (`backend/prisma/schema.prisma`, 12 modelos) y añadirlo tocaría todas las tablas. Para el objetivo pedido ("cambiarlo para otro restaurante fácilmente") la vía correcta es **una instancia por restaurante**: plantilla + seed parametrizado + configuración por despliegue. El multi-tenant queda documentado como trabajo futuro (§7).

## 2. Qué ya está bien (no tocar, apoyarse en ello)

| Elemento | Dónde | Estado |
|---|---|---|
| Esquema de datos genérico | `backend/prisma/schema.prisma` | Ningún campo específico del dominio marisquería; enums y modelos reutilizables. |
| Carta en BD con CRUD y editor | `MenuCategory`/`MenuItem` + `backend/src/controllers/backoffice/menuController.js` + `CartaPage` | Cualquier bar puede cargar su carta sin código. |
| Zonas y mesas en BD con CRUD | `Zone`/`Table` + `zoneController.js` + `MesasPage` | Genérico. |
| Turnos en BD (parcial) | `Shift` + `shiftController.js` + `ConfiguracionPage` | Editables, pero **no se pueden crear ni borrar** (solo `GET`/`PATCH`, ver M4). |
| Mecanismo `SystemConfig` + `/api/public/config` + `ConfigContext` | `backend/src/services/configService.js`, `frontend/src/context/ConfigContext.tsx` | La tubería identidad→web pública ya existe; hay que ensancharla. |
| i18n del frontend público | `frontend/src/i18n.ts` + `locales/{es,en,fr}.json` | Infraestructura correcta; el problema es *qué* hay dentro de las claves (contenido de marca) y lo que queda fuera (panel admin). |
| Tokens CSS centralizados (parcial) | `frontend/src/styles/index.css:6-80` (43 tokens + bloque dark) | Buena base de theming; hay fugas (§3.E). |

## 3. Inventario de acoplamiento

### A. Identidad y contacto (nombre, dirección, teléfono, email, redes)

| Dónde | Qué |
|---|---|
| `backend/prisma/seed.ts:256-264` | Claves `restaurant_name/address/phone/email` + `opening_days` sembradas con los datos del Mesón. **Fuente de verdad legítima** (BD). |
| `backend/src/config/publicConfig.js:1-6` | Defaults duplicados del backend. |
| `frontend/src/constants/publicConfig.ts:44-47` | **Tercera copia** de los mismos defaults (divergirá de la del backend). |
| `backend/src/services/emailService.js:14-16,152` | `RESTAURANT_NAME`, `RESTAURANT_ADDRESS` (¡otra ciudad!), teléfono `956 00 00 00` y remitente `"Alex - Mesón Marinero"` como **constantes de módulo**: los emails ignoran `systemConfig`. |
| `backend/src/config/constants.js:22-25` | `EMAIL.FROM = 'reservas@mesonmarinero.com'` — cuarta convención, **nunca usada**. |
| `frontend/src/pages/admin/AdminLayout.tsx:40,86`, `LoginPage.tsx:35-36,46`, `DashboardPage.tsx:71` | El panel admin escribe "⚓ Mesón Marinero" en duro (no usa `useConfig`), incluido el placeholder `admin@mesonmarinero.es`. |
| `frontend/src/components/Navbar.tsx:38-39` | Emoji ⚓ fijo junto al nombre y subtítulo "Alicante, Mediterráneo" hardcodeado (existe la clave `navbar.location` traducida y sin usar). |
| `frontend/src/components/reservation/Step3Success.tsx:70` | Teléfono de cancelación `+34 912 345 678` fijo. |
| `frontend/src/components/Footer.tsx:29-30,39-40,16` | Redes sociales fijadas a Instagram/Facebook con `href="#"`, enlaces legales vacíos y **mapa como captura estática** `/img/Mapa.jpg`. |
| `frontend/index.html:7-8` | `<title>` y meta description "marisquería en Alicante". |
| `README.md:53-54`, `testapi.sh:3`, contenedores `resto_*`, BD `mesonMarinero` | Identidad en docs e infraestructura (§3.G). |

### B. Contenido de marketing, historia y reseñas

| Dónde | Qué |
|---|---|
| `frontend/src/locales/es.json` (y en/fr) | Los JSON de idioma mezclan **UI genérica** ("Reservar", "Siguiente") con **contenido de marca**: historia con nombres propios reales (`es.json:23` "nuestros padres, Eduardo y Alicia… desde 1988"; `es.json:35` "familia Rodríguez… verano de 1990" — además se contradicen 1988/1990), valores (`es.json:38-43`), horarios mostrados (`es.json:50` "Comidas: 13:30 – 16:00 · Cenas: 20:30 – 23:00" — **no derivan de los `Shift` reales**), días (`es.json:51` "Martes a Domingo" — no deriva de `opening_days`), copyright con nombre y año (`es.json:52,112`, con años contradictorios 2026/2024) y direcciones fantasma (`es.json:107-108` "Calle del Mar 123, Madrid", claves sin uso). |
| `backend/src/controllers/reviewsController.js:16-58,92-117` | Reseñas mock/fallback con textos de paella/pulpo/"corazón de Alicante" **dentro del backend**, duplicadas dos veces; `language=es` fijo en la llamada a Google (`:63`). |
| `backend/src/config/publicConfig.js:8-46` + `frontend/src/constants/publicConfig.ts:3-41` | `DEFAULT_SPECIALTIES`: 3 platos de marisquería con traducciones e imágenes, duplicados en backend y frontend. El editor (`CartaPage.tsx:555-622`) está **fijado a exactamente 3 platos** ("Los 3 Platos Especiales") y el tipo `LocalizedText` fija los idiomas a `{es,en,fr}` (`frontend/src/types/index.ts:81-97`). |
| `frontend/src/tests/components/*.test.tsx` | Los tests asertan literales de marca (`'⚓ Mesón Marinero'`, "Paella Marinera") → cambiar de restaurante rompe la suite. |

### C. Reglas de negocio hardcodeadas

| Dónde | Qué |
|---|---|
| `backend/src/config/constants.js:7-11` | `PAX.MIN/MAX` y el mensaje de contacto; convive con `configService.getMaxPax()` que calcula el máximo desde las mesas — **dos fuentes para el mismo límite**. |
| `backend/src/config/constants.js:14-19` | Duraciones por comensales (90/120/150/180 min) — un bar de tapas o un fine-dining necesitan otras. |
| `backend/src/config/constants.js:34-39` | `MAX_DAYS_AHEAD: 30`, `MIN_HOURS_AHEAD: 2`, offsets de sugerencias. |
| `backend/src/config/constants.js:28-31` | Umbral de no-shows para riesgo/blacklist. |
| `backend/src/utils/tableHelpers.js:9-14` | La tabla de duraciones repetida en código. |
| `backend/prisma/schema.prisma:127` | `Shift.maxBookingsPerSlot` existe pero **no se aplica en ninguna parte** (límite de cocina no funcional). |
| `frontend/src/pages/admin/ReservasPage.tsx:334` | `max="20"` de pax fijo en el formulario manual, ignorando el máximo real. |

### D. Datos operativos (seed) y demo

| Dónde | Qué |
|---|---|
| `backend/prisma/seed.ts:48-67` | Turnos del Mesón (Comidas/Cenas, días concretos) con `opening_days` **contradictorio** con los `daysOfWeek` (BUG-10 del otro plan). |
| `backend/prisma/seed.ts:74-111` | 1 zona "Salón Principal" + 15 mesas concretas. |
| `backend/prisma/seed.ts:118-249` | 12 clientes con **datos personales aparentemente reales** (emails corporativos, móviles reales) — sustituir por sintéticos (RGPD; BUG-37). |
| `backend/prisma/seed.ts:281-471` | 16 reservas fijas de mayo 2026 (caducan) con tokens predecibles `demo-may-*`. |
| `backend/prisma/seed.ts:502-603` | Carta completa de marisquería con marcas comerciales de terceros (Anchoa de Lolín, Real Conservera, Caviar Tanit…). `MenuItem.price` es `String` con formatos libres (`'4.5 / 6€'`, `'S. Mercado'`) → imposible ordenar/formatear moneda por configuración. |
| `backend/prisma/seed.ts:29-41` | Admin demo `admin@mesonmarinero.com`/`admin1234` impreso por consola y publicado en `README.md:53-54`. |

### E. Tema visual y assets

| Dónde | Qué |
|---|---|
| `frontend/src/styles/index.css:6-80` | Paleta en tokens ✔, pero los colores de marca (azul marino `--primary #0F172A`, etc.) no son configurables por despliegue. |
| Colores sueltos fuera de tokens | `index.css:343-379,1213` (badges, estrella Google), `AdminPages.css:77,362,537-581,601,606` (**28 hex literales**), `CustomersPage.css:76,335,366`, `LoginPage.css:5` (gradiente de marca), `ReservationPage.css:38-40,235,255`, `AdminLayout.css:149`, inline en `Step3Success.tsx:68-69`. |
| Tipografías | Google Fonts `Playfair Display` + `Lato` fijadas en `frontend/index.html:9-11` y **repetidas en ~28 `font-family`** en vez de tokens `--font-heading/--font-body`. |
| Iconografía | Emoji ⚓ como logo en Navbar, LoginPage y AdminLayout (identidad marinera en el código). |
| Imágenes | `frontend/public/img/` (8,2 MB de PNG sin optimizar, del local real) referenciadas desde CSS (`index.css:557`, `PageHero.css:7`, `ReservationPage.tsx:44`) y desde el **backend** (`publicConfig.js:23-43` apunta a `/img/*.png` del frontend: acoplamiento cruzado de despliegue). ~3,4 MB son capturas de documentación sin uso. `favicon.svg` de 216 KB. Referencia rota `/restaurant.jpg` (`ReservationPage.css:41`). |
| Plantilla de email | `backend/src/services/emailService.js:22-116` — gradiente azul marino, Montserrat y branding embebidos en el HTML. |

### F. Idiomas

| Dónde | Qué |
|---|---|
| Mensajes de la API | Todos los `message` del backend en español literal (p. ej. `availabilityService.js:58`, `validationService.js:15`, `reservationController.js:119-121`, `errorHandler.js:71`), sin códigos traducibles ni `Accept-Language`. |
| Emails | Solo en español (`emailService.js:122-153`); `Customer.language` (ES/EN/FR, `schema.prisma:207-211`) **nunca se escribe ni se lee**. |
| Panel admin | 0 % i18n (ningún fichero de `pages/admin/` usa `react-i18next`); `STATUS_LABELS` en español fijo (`frontend/src/constants/reservationStatus.ts:3-11`); locales `'es-ES'` fijos en formatos de fecha. |
| Idiomas soportados | Fijados a `{es,en,fr}` en `frontend/src/types/index.ts:81-97`, en el enum `Language` del schema y en los ficheros de locales — añadir alemán para un bar de costa exige tocar tipos, schema y componentes. |
| Rutas y HTML | Rutas públicas en español (`/reservar`, `/carta`, `/historia` — `App.tsx:30-32`) y `<html lang="es">` fijo (`index.html:2`) aunque la UI cambie de idioma. |

### G. Infraestructura y despliegue

| Dónde | Qué |
|---|---|
| `docker-compose.yml:5-9,27,49,66` / `docker-compose.prod.yml:9,32` | Contenedores `resto_*` y BD `mesonMarinero` fijados; además el nombre de BD diverge en 5 sitios (`mesonMarinero`, `meson_marinero` en Render, `gestor_reservas` en `.env`, `tfg_db` en `backend/README.md:25`, `dbname` en `.env.example`). |
| `docker-compose.yml:37` | `TZ: Europe/Madrid` solo en dev; la TZ del restaurante debería ser **configuración obligatoria** (BUG-04). |
| `frontend/public/_redirects`, `README.md:158-180` | Convenciones específicas de Render/Netlify. |
| `backend/seed-prod.sh` | Credenciales reales + seed destructivo (BUG-01; eliminar el fichero como parte de M0). |

### Priorización del acoplamiento

| Prioridad | Bloques | Justificación |
|---|---|---|
| 🔴 Crítico | A (identidad contradictoria: 3 direcciones y 3 teléfonos conviviendo, uno visible en la confirmación de reserva), D-seed (datos personales reales + credenciales demo publicadas) | Afecta a clientes reales hoy mismo, sin cambiar de restaurante. |
| 🟠 Alto | B (marketing/horarios hardcodeados que mienten sobre los turnos reales), C (reglas de negocio en constantes), F-emails/API (idioma fijo pese a dominio trilingüe) | Bloquean directamente el objetivo "otro restaurante sin tocar código". |
| 🟡 Medio | E (tema visual: tokens incompletos, 28 hex sueltos, fuentes repetidas, 8,2 MB de imágenes), F-panel (admin sin i18n), G (nombres de BD/contenedores) | Adaptables hoy a mano, pero con coste y riesgo de regresión. |
| ⚪ Bajo | Rutas en español, capturas muertas en `public/img`, `_redirects` específico de plataforma | Cosmético u ocasional. |

## 4. Diseño objetivo

Principios:

1. **Una sola fuente de verdad por tipo de dato**: identidad y contenidos → `SystemConfig` (BD, editable desde el panel); reglas de negocio → `SystemConfig` con caché en el backend; textos de UI → locales i18n **sin contenido de marca**; tema → tokens CSS alimentados por config; datos operativos → BD vía seed parametrizado.
2. **Los defaults del código deben ser neutros** ("Mi Restaurante", paleta neutra, imágenes placeholder), nunca los datos de un cliente concreto: así un fallo de configuración se *ve* en vez de camuflarse de dato real (hoy BUG-45/47 hacen lo contrario).
3. **El backend no conoce assets del frontend** (romper la referencia `publicConfig.js → /img/*.png`): las especialidades guardan URLs propias del despliegue.
4. **Claves de configuración tipadas y validadas** (hoy `PATCH /backoffice/config` acepta cualquier cosa — BUG-05): un módulo `configSchema` compartido define clave, tipo, validación y default neutro; el controller lo aplica y `getFullConfig` cachea.

Artefacto central propuesto: un **`restaurant.config.json` por despliegue** (o secciones nuevas de `SystemConfig` sembradas desde él) con: identidad, contacto, redes, TZ, moneda/formato de precios, idiomas activos y por defecto, colores/fuentes/logo, imágenes de portada, textos de historia/valores por idioma, reglas de reserva (duraciones por pax, antelaciones, ventana de reserva, umbral no-show) y datos operativos iniciales (zonas/mesas/turnos/carta) para el seed.

## 5. Plan por fases

### M0 — Saneamiento previo (½ día)
- Eliminar `backend/seed-prod.sh` y rotar credenciales (coordinado con F1 del plan de bugs); sustituir los 12 clientes reales del seed por datos sintéticos; borrar las capturas sin uso de `frontend/public/img/`.
- **Hecho cuando:** no queda ningún dato personal real ni credencial en el repo.

### M1 — Fuente única de identidad (1-2 días)
- Definir `configSchema` (backend) con las claves actuales + nuevas: `restaurant_tagline`, `social_instagram/facebook/...`, `maps_url`, `timezone`, `currency`, `cancellation_phone` (o reutilizar `restaurant_phone`).
- `emailService` deja de usar constantes de módulo y lee de `configService` (nombre, dirección, teléfono, remitente); eliminar `EMAIL.*` muerto de `constants.js:22-25`.
- Sustituir todos los literales de marca del frontend por `useConfig()`: `AdminLayout.tsx:40,86`, `LoginPage.tsx:35-36,46`, `DashboardPage.tsx:71`, `Navbar.tsx:38-39`, `Step3Success.tsx:70`, `Footer.tsx:16,29-30`.
- Unificar los defaults duplicados: el frontend deja de tener su copia (`constants/publicConfig.ts`) con datos reales y pasa a defaults neutros; `index.html` title/description genéricos (o generados en build desde config).
- Los horarios/días mostrados al público (`es.json:50-51`, `ReservationPage`) pasan a derivarse de los `Shift` y `opening_days` reales vía API.
- **Hecho cuando:** `grep -ri "marinero\|alicante\|965 00\|956 00\|912 345" backend/src frontend/src` devuelve 0 resultados fuera de seeds/fixtures, y cambiar el nombre desde ConfiguracionPage se refleja en web pública, panel, `<title>` y emails.

### M2 — Contenido editable y neutro (2-3 días)
- Mover historia/valores/tagline de los locales JSON a claves `SystemConfig` multiidioma (mismo patrón `LocalizedText` que ya usa `specialties_config`), dejando en los JSON solo UI genérica.
- Especialidades: permitir N platos (quitar el "3" fijo de `CartaPage.tsx:555-622` y del tipo), con imágenes por URL/upload en vez de rutas fijas.
- Reseñas: mock/fallback del backend a un fichero de datos neutro o clave de config; extraer la función duplicada; `language` de la petición a Google desde config.
- Assets gestionados: convención `frontend/public/branding/` (logo, hero, about, mapa) referenciada desde config; optimizar a WebP; favicon real (<10 KB).
- Actualizar los tests para asertar contra fixtures neutros, no contra "Mesón Marinero".
- **Hecho cuando:** un despliegue sin personalizar muestra "Mi Restaurante" con imágenes placeholder y ninguna referencia al Mesón; todo lo visible se edita desde el panel.

### M3 — Theming (1-2 días)
- Completar tokens: `--font-heading/--font-body` (eliminar las ~28 repeticiones de `font-family`), migrar los 28+ hex sueltos de `AdminPages.css`/badges a `--status-*`/tokens semánticos, añadir `--radius-md` que falta (`AboutUs.tsx:21`).
- Inyectar la paleta desde config (bloque `:root` generado con `brand_primary`, `brand_accent`, etc.), incluido el gradiente del login y la plantilla de email (colores/fuente del email desde las mismas claves).
- Logo configurable (imagen o emoji) en Navbar/Login/AdminLayout.
- **Hecho cuando:** cambiar 4 claves de color + logo en config re-tematiza web pública, panel y emails sin tocar CSS.

### M4 — Reglas de negocio configurables y operativa completa (2-3 días)
- Mover a `SystemConfig` (con caché y validación): duraciones por tramo de pax, `MIN_HOURS_AHEAD`, `MAX_DAYS_AHEAD`, offsets de sugerencias, umbral de no-shows, `PAX.MIN`. `getMaxPax()` queda como única fuente del máximo.
- CRUD completo de turnos (`POST`/`DELETE` faltan en `backend/src/routes/backoffice/shifts.js` y en la UI): un bar con un solo turno continuo o un brunch de fin de semana debe poder configurarse desde el panel.
- UI de cierres/festivos (el backend ya existe: `closureController.js`; el frontend no tiene nada — ver BUG-11 para la semántica de `endDate` antes de exponerla).
- Aplicar `Shift.maxBookingsPerSlot` en la disponibilidad (hoy campo muerto) para limitar cocina.
- Unificar `opening_days` con `Shift.daysOfWeek` (derivar los días de apertura de los turnos y eliminar la clave, o validar coherencia al guardar).
- `MenuItem.price`: decidir formato (mantener texto libre + añadir `currency` de config para el símbolo, o migrar a numérico con campo de nota) y formatear según config.
- **Hecho cuando:** un "bar de tapas" (turno único 12:00-23:30, mesas de 2-4, reservas de 60 min, antelación 1 h) se configura íntegramente desde el panel, con tests de T1 parametrizados que lo demuestren.
- *Depende de:* F3 del plan de bugs (validación de turnos/config) para no exponer más superficie sin validar.

### M5 — i18n integral (2-3 días)
- Backend: las respuestas devuelven `code` estable (ya existen: `INVALID_BOOKING_SLOT`, etc.) y el frontend traduce por código, dejando `message` solo como fallback de depuración.
- Emails: guardar `Customer.language` al reservar (el frontend ya conoce el idioma activo) y plantillas por idioma.
- Panel admin: migrar a `react-i18next` (incluye `STATUS_LABELS` y los locales `es-ES` de fechas → locale del idioma activo o TZ/locale de config).
- Idiomas activos y por defecto configurables (lista en config; `supportedLngs` en `i18n.ts`; `<html lang>` dinámico); evaluar rutas neutras (`/booking`) con alias o rutas por idioma.
- **Hecho cuando:** un cliente que reserva en inglés recibe el email en inglés; el panel puede usarse en inglés; añadir un idioma nuevo = añadir un JSON + activarlo en config (sin tocar tipos ni schema — relajar `LocalizedText` y el enum `Language`).

### M6 — Plantilla de despliegue (1-2 días)
- `seed.ts` parametrizado: lee `restaurant.seed.json` (zonas, mesas, turnos, carta, config) con un ejemplo neutro versionado; separar **seed de demo** (datos de ejemplo, reservas relativas a "hoy" en vez de fechas fijas) de **seed de producción** (solo estructura + admin con contraseña obligatoria por env var).
- Docker parametrizado: nombre de proyecto/BD, `TZ`, puertos y credenciales por variables con defaults seguros; corregir de paso el compose de prod (F5 del plan de bugs).
- Documentar el proceso: `docs/NUEVO_RESTAURANTE.md` con checklist (rellenar config → assets en `/branding` → seed → desplegar).
- **Hecho cuando (prueba de fuego global):** partiendo del repo limpio, montar un "Bar Ejemplo" completo (otra marca, otra carta, otro horario, otros colores, otro idioma por defecto) **sin editar ningún fichero bajo `backend/src` ni `frontend/src`**, solo `restaurant.seed.json`, variables de entorno, assets y el panel de administración.

## 6. Orden recomendado y dependencias

```
M0 ──► M1 ──► M2 ──► M3
        │
        └───► M4 ──► M6
        └───► M5 (independiente de M2-M4, tras M1)
```

Esfuerzo total estimado: **9-15 días** de trabajo efectivo. M1 es la fase con mejor relación esfuerzo/beneficio: elimina las contradicciones de identidad y habilita todo lo demás. Se recomienda intercalar las fases F1-F3 del [plan de bugs](./PLAN_BUGS_Y_TESTS.md) antes de M4, porque varias correcciones (validación de config y turnos, semántica de cierres, TZ) son prerequisito de exponer esa superficie a configuración.

## 7. Fuera de alcance (documentado como futuro)

- **Multi-tenant real** (varios restaurantes en una misma instancia/BD): exigiría `restaurantId` en los 12 modelos, particionado de sockets, subdominios y aislamiento de auth. El diseño por instancia cubre el objetivo actual con una fracción del coste.
- **CMS completo** para páginas arbitrarias: se cubre lo existente (home, historia, carta, reservas) vía config; páginas nuevas siguen siendo desarrollo.
- **Pasarela de pago / señal de reserva**: fuera del alcance de la modularización.
