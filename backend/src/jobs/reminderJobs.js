
const crypto = require('crypto');
const prisma = require('../config/database');
const configService = require('../services/configService');
const emailService = require('../services/emailService');
const socketManager = require('../socketManager');
const { BOOKING_STATUS } = require('../config/constants');
const { recordEvent, EVENT_TYPES } = require('../services/bookingEventService');
const { logger } = require('../config/logger');

// N1.2: barrido periódico de recordatorios y reconfirmación. Diseñado para
// llamarse desde el scheduler (node-cron) o directamente desde los tests con
// el reloj congelado. Idempotente: `emailSentAt` es la guarda de envío único
// (se marca ANTES de enviar → como mucho un email por reserva, también tras
// reinicios del proceso).

// Aviso al panel en modo 'notify': dedup en memoria por proceso (un reinicio
// puede repetir el aviso en el panel, pero nunca el email al cliente).
const notifiedPending = new Set();

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

async function readReminderConfig() {
  const values = await configService.getConfigValues([
    'reminder_enabled',
    'reminder_hours_before',
    'reminder_unconfirmed_policy',
    'reminder_autocancel_hours_before'
  ]);
  return {
    enabled: values.reminder_enabled === 'true',
    hoursBefore: parseInt(values.reminder_hours_before, 10) || 24,
    policy: values.reminder_unconfirmed_policy === 'autocancel' ? 'autocancel' : 'notify',
    autocancelHoursBefore: parseInt(values.reminder_autocancel_hours_before, 10) || 4
  };
}

/**
 * Fase 1: enviar recordatorio (T-{hoursBefore}) a las reservas CONFIRMED que
 * aún no lo han recibido. Genera el reconfirmToken si no existe.
 */
async function sendPendingReminders(now, config) {
  const due = await prisma.booking.findMany({
    where: {
      status: BOOKING_STATUS.CONFIRMED,
      emailSentAt: null,
      date: { gt: now, lte: addHours(now, config.hoursBefore) }
    },
    include: {
      customer: true,
      table: { include: { zone: true } }
    }
  });

  let sent = 0;
  for (const booking of due) {
    const reconfirmToken = booking.reconfirmToken || crypto.randomBytes(16).toString('hex');
    // Guarda de idempotencia ANTES de enviar (at-most-once)
    await prisma.booking.update({
      where: { id: booking.id },
      data: { reconfirmToken, emailSentAt: now }
    });
    emailService.sendBookingReminder({ ...booking, reconfirmToken }, booking.customer);
    recordEvent(booking.id, EVENT_TYPES.REMINDER_SENT, 'sistema');
    sent += 1;
  }

  if (sent > 0) logger.info(`⏰ Recordatorios enviados: ${sent}`);
  return sent;
}

/**
 * Fase 2: reservas que recibieron el recordatorio y NO se han reconfirmado
 * cuando queda poco para la hora (T-{autocancelHoursBefore}).
 * - policy 'notify': avisa al panel por socket (sin tocar la reserva).
 * - policy 'autocancel': cancela, avisa al panel y envía email de cancelación.
 */
async function handleUnconfirmed(now, config) {
  const pending = await prisma.booking.findMany({
    where: {
      status: BOOKING_STATUS.CONFIRMED,
      emailSentAt: { not: null },
      reconfirmedAt: null,
      date: { gt: now, lte: addHours(now, config.autocancelHoursBefore) }
    },
    include: {
      customer: true,
      table: { include: { zone: true } }
    }
  });

  let processed = 0;
  for (const booking of pending) {
    if (config.policy === 'autocancel') {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: BOOKING_STATUS.CANCELLED, modifiedAt: now }
      });
      socketManager.emitToBackoffice('reservation_cancelled', {
        id: booking.id,
        date: booking.date,
        pax: booking.pax
      });
      emailService.sendBookingCancellation(booking, booking.customer, { byRestaurant: true });
      recordEvent(booking.id, EVENT_TYPES.CANCELLED, 'sistema', { via: 'sin reconfirmar' });
      // N1.4: el hueco liberado se ofrece a la lista de espera
      require('../services/waitlistService').notifyNextForDate(booking);
      logger.info(`⏰ Reserva auto-cancelada por falta de reconfirmación: ${booking.id}`);
      processed += 1;
    } else if (!notifiedPending.has(booking.id)) {
      socketManager.emitToBackoffice('reconfirmation_pending', {
        id: booking.id,
        date: booking.date,
        pax: booking.pax,
        customerName: booking.customer
          ? `${booking.customer.firstName} ${booking.customer.lastName}`
          : null
      });
      notifiedPending.add(booking.id);
      processed += 1;
    }
  }

  return processed;
}

/**
 * Barrido completo. `now` inyectable para tests con reloj congelado.
 */
async function runReminderSweep(now = new Date()) {
  const config = await readReminderConfig();
  if (!config.enabled) return { reminders: 0, unconfirmed: 0 };

  const reminders = await sendPendingReminders(now, config);
  const unconfirmed = await handleUnconfirmed(now, config);
  return { reminders, unconfirmed };
}

/** Solo para tests: limpia el dedup en memoria de avisos al panel */
function resetNotifiedPending() {
  notifiedPending.clear();
}

module.exports = { runReminderSweep, resetNotifiedPending };
