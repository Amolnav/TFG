# Alta de un restaurante nuevo

> Objetivo del plan de modularidad: adaptar el sistema a otro restaurante o bar
> es **configuración, datos y assets** — nunca tocar código bajo `backend/src`
> ni `frontend/src`.
>
> El dataset [`bar-ejemplo`](../backend/prisma/restaurants/bar-ejemplo.ts) es la
> plantilla de referencia: otra marca, otra carta, otro horario, otros colores y
> otro idioma por defecto, montado exactamente con este checklist.

## ⚡ Vía rápida: un comando (N4.5)

Con el dataset ya creado (paso 1), todo lo demás lo hace
[`scripts/new-client.sh`](../scripts/new-client.sh):

```bash
scripts/new-client.sh <mi-restaurante>          # desarrollo (seed demo)
scripts/new-client.sh --prod <mi-restaurante>   # producción (seed prod)
```

Valida el dataset, genera el `.env` con **secretos aleatorios** (contraseña de
BD, `JWT_SECRET` y contraseña de admin, que imprime una sola vez), levanta el
stack, aplica migraciones, siembra y verifica `/health` y la identidad servida.
Medido: **de cero a stack funcionando en menos de un minuto** con imágenes
cacheadas (objetivo del plan: < 15 minutos). Los pasos siguientes de este
documento explican el detalle y los ajustes finos desde el panel.

## 1. Crea el fichero de datos del restaurante

1. Copia `backend/prisma/restaurants/bar-ejemplo.ts` a
   `backend/prisma/restaurants/<mi-restaurante>.ts` y ajusta:
   - **`config`** — identidad (`restaurant_name`, `restaurant_tagline`,
     dirección, teléfono, email, redes, `maps_url`, `timezone`, `currency`),
     idiomas (`languages_supported`, `language_default`), marca visual
     (`brand_logo`, `theme_*`, `font_*`, `fonts_url`), reglas de reserva
     (`booking_durations`, `booking_min_hours_ahead`, `booking_max_days_ahead`,
     `booking_suggestion_offsets`, `booking_max_suggestions`,
     `no_show_threshold`, `pax_min`) y contenidos multiidioma (`hero_config`,
     `about_config`, `history_config`, `reservation_config`,
     `menu_notes_config`, `specialties_config`).
   - **`shifts`** — turnos reales (los **días de apertura públicos se derivan
     de ellos**); `maxBookingsPerSlot` limita cocina por franja (opcional).
   - **`zones`** y sus mesas (capacidades mín/máx).
   - **`menu`** — categorías y platos. El precio es texto libre; los valores
     puramente numéricos (`"12"`) se formatean con la clave `currency`.
2. Regístralo en `backend/prisma/restaurants/index.ts` (una línea de import).
3. Toda clave de `config` debe existir en
   `backend/src/config/configSchema.js` y pasar su validador — el test
   `backend/src/tests/seedConsistency.test.js` lo comprueba automáticamente
   para todos los datasets registrados (`cd backend && npx vitest run`).

## 2. Coloca los assets en `frontend/public/branding/`

Convención (ver [`frontend/public/branding/README.md`](../frontend/public/branding/README.md)):
logo, hero, about, reservation, mapa y platos destacados. Referencia cada
fichero desde el `config` del dataset (p. ej. `hero_config.image:
'/branding/hero.jpg'`). El logo (`brand_logo`) puede ser un emoji o una ruta
de imagen. Formatos recomendados: WebP/JPEG optimizados (&lt; 300 KB).

## 3. Configura el despliegue (variables de entorno)

Copia `.env.example` → `.env` en la raíz y ajusta:

```bash
PROJECT_NAME=mi-restaurante     # prefijo de contenedores
DB_NAME=mi_restaurante          # nombre de la base de datos
DB_PORT=5433 BACKEND_PORT=4000 FRONTEND_PORT=5173   # puertos del host
TZ=Europe/Madrid                # zona horaria del restaurante
RESTAURANT=mi-restaurante       # clave del dataset del paso 1
SEED_MODE=demo                  # demo | prod
```

Para producción (`docker-compose.prod.yml`) además: `DB_PASSWORD`,
`JWT_SECRET`, `FRONTEND_URL` y — **obligatorio con `SEED_MODE=prod`** —
`SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` (el seed de producción no crea
credenciales por defecto ni datos de ejemplo). Variables SMTP en
`backend/.env.example`.

## 4. Levanta el stack y siembra

```bash
docker compose up -d --build db backend frontend
docker compose exec backend npx prisma migrate deploy   # (el backend ya lo hace al arrancar)
docker compose exec backend npm run db:seed             # usa RESTAURANT y SEED_MODE del entorno
```

Verifica la identidad servida por la API:

```bash
curl -s localhost:4000/api/public/config | python3 -m json.tool | head
```

Debe devolver el nombre, tema y contenidos del restaurante nuevo, y
`schedule` con los turnos reales.

## 5. Revisa y afina desde el panel de administración

Entra en `http://localhost:5173/admin` con el admin del seed:

- **Configuración** → Información del Restaurante (identidad, idiomas,
  moneda, zona horaria), Marca y Tema (logo, colores, fuentes — la web y el
  panel se re-tematizan al momento), Reglas de Reserva, Turnos (crear /
  editar / borrar, límite por franja) y Cierres/Festivos.
- **Contenido** → hero, "sobre nosotros", historia (secciones y valores),
  cita de la página de reservas y nota de la carta, por idioma.
- **Carta / Menú** → categorías, platos y Platos Destacados (N platos).
- **Mesas** → zonas y mesas.

Todo lo anterior escribe en `SystemConfig`/BD vía la API validada
(`PATCH /api/backoffice/config` con whitelist tipada): no requiere código.

## 6. Comprobación final

- La home, la carta, la historia y la página de reservas muestran la marca
  nueva (título del navegador incluido).
- El panel muestra el nombre y logo nuevos en sidebar/topbar/login.
- Los horarios mostrados al público coinciden con los turnos del panel.
- Una reserva de prueba envía el email con la marca, colores y el idioma del
  cliente.
- `grep` de la marca anterior en `backend/src`, `frontend/src` y
  `frontend/index.html` devuelve 0 resultados: la identidad vive solo en el
  dataset y en la BD.

## Fuera del alcance de la plantilla

Multi-tenant (varios restaurantes por instancia), CMS de páginas arbitrarias,
subida de ficheros desde el panel (los assets entran por `public/branding/`)
y pasarela de pago. Ver §7 de [PLAN_MODULARIDAD.md](./PLAN_MODULARIDAD.md).
