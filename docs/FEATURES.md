# 📝 Funcionalidades del Sistema

Este documento enumera las características implementadas y funcionales del Sistema de Gestión de Restaurantes.

## 👥 Gestión de Clientes (CRM)
- **Identidad Unificada:** El sistema detecta y vincula automáticamente reservas de un mismo cliente mediante su email (actual o histórico). El teléfono se actualiza sobre el cliente identificado, pero nunca se usa para fusionar identidades.
- **Historial de Cliente:** Registro de visitas totales, no-shows, alérgenos y preferencias personales.
- **Etiquetado:** Soporte para etiquetas personalizadas, marcación de clientes **VIP** y **Lista Negra (Blacklist)** con motivos específicos.
- **Multilingüe (parcial):** La interfaz pública está disponible en ES/EN/FR. El modelo de datos contempla el idioma del cliente (`Customer.language`), aunque los emails de confirmación se envían actualmente en español.

## 📅 Reservas (Bookings)
- **Portal Público:** Formulario de reserva intuitivo para clientes externos.
- **Gestión de Estados:** Flujo completo desde `Pendiente` -> `Confirmada` -> `Sentada` -> `Completada`. Soporte para cancelaciones y no-shows.
- **Asignación de Mesas:** Asignación manual o automática por el personal a mesas específicas en el local.
- **Reservas del Mismo Día:** Permite a los clientes reservar para la jornada actual según la configuración del sistema.

## 🛠️ Panel de Administración
- **Dashboard en Tiempo Real:** Visualización instantánea de nuevas reservas y cambios mediante WebSockets.
- **Gestión de Local:** Creación y edición de Zonas (Terraza, Salón, etc.) y Mesas con capacidades específicas.
- **Control de Turnos (Shifts):** Configuración de horarios de apertura e intervalos de reserva, con validación estricta de formato y rangos. (El campo `maxBookingsPerSlot` existe en el modelo pero aún no se aplica en la disponibilidad.)
- **Cierres Temporales:** API para bloquear un día completo, un rango de fechas o un turno específico (festivos, eventos privados). Se gestiona vía API; todavía no tiene interfaz en el panel.

## 🍽️ Gestión de Menú
- **Categorías:** Organización del menú por secciones (Entrantes, Platos Principales, Postres, Bebidas).
- **Items:** Gestión de platos con nombres, descripciones y precios. Posibilidad de desactivar platos temporalmente.

## 🌍 Internacionalización (i18n)
- Soporte completo para **Español**, **Inglés** y **Francés** en la interfaz pública.
- Detección automática de idioma del navegador.

## 🧪 Calidad y Pruebas
- **Pruebas de Backend:** Suite unitaria (81 tests con reloj congelado e independiente de la TZ del host) y suite de integración contra PostgreSQL real (docker compose de test).
- **Pruebas de Frontend:** Tests de componentes, servicios y contextos (sesión, ProtectedRoute, wizard de reserva con guardia de doble envío, manejo de 401) y tests E2E con Playwright.
- **Entorno Dockerizado:** Soporte para desarrollo mediante contenedores.
