
const { logger } = require('./logger');

// N4.3: Sentry OPCIONAL por variable de entorno. Sin SENTRY_DSN (o sin el
// paquete @sentry/node instalado) todo es no-op: el producto no depende de
// Sentry para funcionar.
//
// Para activarlo en un despliegue:
//   1. npm install @sentry/node
//   2. exportar SENTRY_DSN=https://...@sentry.io/...

let sentry = null;

function initMonitoring() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return { enabled: false };

  try {
    // Dependencia opcional: solo se carga si está instalada
    sentry = require('@sentry/node');
  } catch {
    logger.warn('SENTRY_DSN definido pero @sentry/node no está instalado; monitorización desactivada (npm install @sentry/node)');
    return { enabled: false };
  }

  sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development'
  });
  logger.info('🛰️ Sentry inicializado');
  return { enabled: true };
}

/** Envía la excepción a Sentry si está activo; no-op en caso contrario. */
function captureException(error) {
  if (!sentry) return;
  try {
    sentry.captureException(error);
  } catch {
    // la monitorización nunca debe romper el manejo de errores
  }
}

module.exports = { initMonitoring, captureException };
