
const prisma = require('../config/database');
const configService = require('./configService');
const customerService = require('./customerService');
const emailService = require('./emailService');
const socketManager = require('../socketManager');
const { formatDate } = require('../utils/dateHelpers');
const { logger } = require('../config/logger');

// N1.4: lista de espera sobre el modelo Waitlist existente (isResolved,
// notifiedAt, resolvedAt). Flujo:
//   1. El wizard apunta al cliente cuando un día está completo.
//   2. Al cancelarse una reserva de ese día, el PRIMERO de la lista recibe un
//      email con enlace de reserva; el aviso expira (waitlist_hold_hours) y
//      el barrido del scheduler pasa al siguiente.
//   3. Si el cliente avisado reserva ese día, su entrada se resuelve.
// notifiedAt hace de guarda: una entrada avisada no se re-avisa nunca.

function dayBounds(date) {
  const day = new Date(date);
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
  return { start, end };
}

async function getWaitlistConfig() {
  const values = await configService.getConfigValues(['waitlist_enabled', 'waitlist_hold_hours']);
  return {
    enabled: values.waitlist_enabled === 'true',
    holdHours: parseInt(values.waitlist_hold_hours, 10) || 2
  };
}

/**
 * Alta pública en la lista de espera. Idempotente por cliente+día.
 * @returns {{ entry, created: boolean }}
 */
async function joinWaitlist({ date, pax, notes, customerData }) {
  const { customer } = await customerService.findOrCreateCustomer(customerData.email, customerData);

  const { start, end } = dayBounds(new Date(`${date}T00:00:00`));
  const existing = await prisma.waitlist.findFirst({
    where: {
      customerId: customer.id,
      isResolved: false,
      date: { gte: start, lte: end }
    }
  });
  if (existing) {
    return { entry: existing, created: false };
  }

  const entry = await prisma.waitlist.create({
    data: {
      date: new Date(`${date}T00:00:00`),
      pax: parseInt(pax, 10),
      notes: notes || null,
      customerId: customer.id
    },
    include: { customer: true }
  });

  socketManager.emitToBackoffice('waitlist_joined', {
    id: entry.id,
    date: entry.date,
    pax: entry.pax,
    customerName: `${customer.firstName} ${customer.lastName}`
  });

  return { entry, created: true };
}

function bookUrlFor(entry) {
  const base = process.env.FRONTEND_URL || 'http://localhost:5173';
  // formatDate usa la TZ local del proceso (toISOString desplazaría el día)
  return `${base}/reservar?date=${formatDate(entry.date)}&pax=${entry.pax}`;
}

async function notifyEntry(entry, holdHours, now) {
  // Guarda: notifiedAt se marca ANTES de enviar (nunca se re-avisa)
  await prisma.waitlist.update({
    where: { id: entry.id },
    data: { notifiedAt: now }
  });
  emailService.sendWaitlistAvailable(
    { date: entry.date, pax: entry.pax, table: null },
    entry.customer,
    { holdHours, bookUrl: bookUrlFor(entry) }
  );
  logger.info(`📣 Lista de espera: avisado ${entry.customer.email} para ${formatDate(entry.date)}`);
}

/**
 * Tras una cancelación: avisa al primero de la lista compatible con el hueco
 * liberado. Fire-and-forget seguro (nunca lanza).
 */
async function notifyNextForDate(booking) {
  try {
    const config = await getWaitlistConfig();
    if (!config.enabled) return false;

    const { start, end } = dayBounds(booking.date);
    const maxCapacity = booking.table?.maxCapacity ?? null;

    const next = await prisma.waitlist.findFirst({
      where: {
        isResolved: false,
        notifiedAt: null,
        date: { gte: start, lte: end },
        ...(maxCapacity ? { pax: { lte: maxCapacity } } : {})
      },
      orderBy: { createdAt: 'asc' },
      include: { customer: true }
    });

    if (!next) return false;
    await notifyEntry(next, config.holdHours, new Date());
    return true;
  } catch (error) {
    logger.error('❌ Error avisando a la lista de espera:', error);
    return false;
  }
}

/**
 * Barrido del scheduler: los avisos caducados (notifiedAt + holdHours < now)
 * se resuelven como expirados y se avisa al siguiente de su día.
 */
async function runWaitlistSweep(now = new Date()) {
  const config = await getWaitlistConfig();
  if (!config.enabled) return { expired: 0, notified: 0 };

  const cutoff = new Date(now.getTime() - config.holdHours * 60 * 60 * 1000);
  const expired = await prisma.waitlist.findMany({
    where: {
      isResolved: false,
      notifiedAt: { not: null, lt: cutoff }
    },
    include: { customer: true }
  });

  let notified = 0;
  for (const entry of expired) {
    await prisma.waitlist.update({
      where: { id: entry.id },
      data: { isResolved: true, resolvedAt: now }
    });
    logger.info(`⌛ Lista de espera: aviso caducado para ${entry.customer?.email ?? entry.id}`);

    // Pasa el turno al siguiente de ese mismo día
    const { start, end } = dayBounds(entry.date);
    const next = await prisma.waitlist.findFirst({
      where: {
        isResolved: false,
        notifiedAt: null,
        date: { gte: start, lte: end }
      },
      orderBy: { createdAt: 'asc' },
      include: { customer: true }
    });
    if (next) {
      await notifyEntry(next, config.holdHours, now);
      notified += 1;
    }
  }

  return { expired: expired.length, notified };
}

/**
 * Al crear una reserva: si el cliente estaba en lista de espera para ese día,
 * su entrada queda resuelta. Fire-and-forget seguro.
 */
async function resolveForCustomerAndDate(customerId, date) {
  try {
    const { start, end } = dayBounds(new Date(`${date}T00:00:00`));
    const result = await prisma.waitlist.updateMany({
      where: {
        customerId,
        isResolved: false,
        date: { gte: start, lte: end }
      },
      data: { isResolved: true, resolvedAt: new Date() }
    });
    if (result.count > 0) {
      logger.info(`✅ Lista de espera resuelta al reservar (${result.count} entradas)`);
    }
    return result.count;
  } catch (error) {
    logger.error('❌ Error resolviendo lista de espera:', error);
    return 0;
  }
}

module.exports = {
  joinWaitlist,
  notifyNextForDate,
  runWaitlistSweep,
  resolveForCustomerAndDate
};
