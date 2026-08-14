
const prisma = require('../config/database');
const { logger } = require('../config/logger');

// N2.5: auditoría de cambios de reserva. Cada punto de mutación registra un
// BookingEvent (tipo, quién, cuándo, snapshot del cambio). El registro es
// fire-and-forget: un fallo de auditoría nunca rompe la operación principal.

const EVENT_TYPES = {
  CREATED: 'CREATED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  RESCHEDULED: 'RESCHEDULED',
  MODIFIED: 'MODIFIED',
  TABLE_REASSIGNED: 'TABLE_REASSIGNED',
  CANCELLED: 'CANCELLED',
  RECONFIRMED: 'RECONFIRMED',
  REMINDER_SENT: 'REMINDER_SENT',
  REVIEW_REQUEST_SENT: 'REVIEW_REQUEST_SENT'
};

/**
 * Registra un evento de auditoría. Nunca lanza.
 * @param {string} bookingId
 * @param {string} type - uno de EVENT_TYPES
 * @param {string} actor - staff (nombre/email), 'cliente' o 'sistema'
 * @param {object} [payload] - snapshot del cambio (antes/después, motivo...)
 */
async function recordEvent(bookingId, type, actor, payload = null) {
  try {
    await prisma.bookingEvent.create({
      data: { bookingId, type, actor: actor || null, payload: payload ?? undefined }
    });
  } catch (error) {
    logger.error(`❌ Error registrando evento ${type} de la reserva ${bookingId}:`, error.message);
  }
}

/** Nombre del actor a partir del req autenticado del backoffice */
function actorFromRequest(req) {
  return req.user?.name || req.user?.email || 'staff';
}

module.exports = { recordEvent, actorFromRequest, EVENT_TYPES };
