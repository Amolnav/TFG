
const prisma = require('../config/database');
const configService = require('./configService');
const emailService = require('./emailService');
const { logger } = require('../config/logger');

// N3.4: petición de reseña post-visita. Se dispara al pasar una reserva a
// COMPLETED. Activable por config (review_request_enabled) y con cadencia
// máxima por cliente (review_request_min_days_between); la guarda de envío
// se persiste como BookingEvent REVIEW_REQUEST_SENT (sobrevive reinicios).

const REVIEW_EVENT_TYPE = 'REVIEW_REQUEST_SENT';

function googleReviewUrl(placeId) {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

/**
 * Envía la petición de reseña si procede. Nunca lanza: se llama
 * fire-and-forget desde los puntos de mutación (como los emails).
 * @returns {Promise<boolean>} true si se envió
 */
async function maybeSendReviewRequest(booking) {
  try {
    const values = await configService.getConfigValues([
      'review_request_enabled',
      'review_request_min_days_between'
    ]);
    if (values.review_request_enabled !== 'true') return false;

    const placeId = process.env.GOOGLE_PLACE_ID;
    if (!placeId) {
      logger.warn('⚠️ review_request_enabled=true pero falta GOOGLE_PLACE_ID: no se envía reseña');
      return false;
    }

    if (!booking.customer || !booking.customer.email) return false;

    // Cadencia por cliente: máx. 1 petición cada N días
    const minDays = parseInt(values.review_request_min_days_between, 10) || 30;
    const since = new Date(Date.now() - minDays * 24 * 60 * 60 * 1000);
    const recent = await prisma.bookingEvent.findFirst({
      where: {
        type: REVIEW_EVENT_TYPE,
        createdAt: { gt: since },
        booking: { customerId: booking.customerId }
      }
    });
    if (recent) return false;

    // Guarda persistente ANTES de enviar (at-most-once, también tras reinicios)
    await prisma.bookingEvent.create({
      data: {
        bookingId: booking.id,
        type: REVIEW_EVENT_TYPE,
        actor: 'sistema'
      }
    });

    emailService.sendReviewRequest(booking, booking.customer, {
      reviewUrl: googleReviewUrl(placeId)
    });
    logger.info(`⭐ Petición de reseña enviada: ${booking.id}`);
    return true;
  } catch (error) {
    logger.error('❌ Error enviando petición de reseña:', error);
    return false;
  }
}

module.exports = { maybeSendReviewRequest, REVIEW_EVENT_TYPE, googleReviewUrl };
