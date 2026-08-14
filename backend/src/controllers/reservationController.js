
const crypto = require('crypto');
const prisma = require('../config/database');
const customerService = require('../services/customerService');
const emailService = require('../services/emailService');
const tableAssignmentService = require('../services/tableAssignmentService');
const validationService = require('../services/validationService');
const availabilityService = require('../services/availabilityService');
const { asyncHandler, BusinessError } = require('../middleware/errorHandler');
const socketManager = require('../socketManager');
const { combineDateAndTime } = require('../utils/dateHelpers');
const { calculateDuration } = require('../utils/tableHelpers');
const { BOOKING_SOURCE, BOOKING_STATUS } = require('../config/constants');
const waitlistService = require('../services/waitlistService');
const { recordEvent, EVENT_TYPES } = require('../services/bookingEventService');
const { logger } = require('../config/logger');

/**
 * POST /api/public/reservations
 * Crea una reserva desde el frontend público
 * Body: {
 *   date, time, pax, zoneId?,
 *   customer: { email, firstName, lastName, phone, allergens? },
 *   specialRequests?
 * }
 */
exports.createReservation = asyncHandler(async (req, res) => {
  const {
    date,
    time,
    pax,
    zoneId,
    customer: customerData,
    specialRequests
  } = req.body;
  
  // Validación completa de los datos
  await validationService.validateBookingData({
    date,
    time,
    pax,
    ...customerData
  });
  
  logger.info(`📝 Creando reserva: ${date} ${time} (${pax} pax) - ${customerData.email}`);
  
  // Sanitizar datos
  const sanitizedRequests = validationService.sanitizeText(specialRequests, 500);
  const sanitizedAllergens = validationService.validateAllergens(customerData.allergens);
  
  // Crear/actualizar cliente
  const { customer, isNew } = await customerService.findOrCreateCustomer(
    customerData.email,
    {
      ...customerData,
      allergens: sanitizedAllergens
    }
  );
  
  // Comprobar si está en lista negra
  if (customer.isBlacklisted) {
    throw new BusinessError(
      'No se pueden crear reservas para este cliente. Contacte al restaurante.',
      'CUSTOMER_BLACKLISTED',
      403
    );
  }
  
  const booking = await tableAssignmentService.withBookingTransaction(async (tx) => {
    await availabilityService.assertBookableSlot(date, time, parseInt(pax), { db: tx });

    const assignment = await tableAssignmentService.assignOptimalTable(
      parseInt(pax),
      date,
      time,
      zoneId ? parseInt(zoneId) : null,
      { db: tx }
    );

    const confirmationToken = crypto.randomBytes(16).toString('hex');
    const duration = calculateDuration(parseInt(pax));
    const dateTime = combineDateAndTime(date, time);

    const created = await tx.booking.create({
      data: {
        date: dateTime,
        duration,
        pax: parseInt(pax),
        status: BOOKING_STATUS.CONFIRMED,
        source: BOOKING_SOURCE.WEB,
        specialRequests: sanitizedRequests || null,
        customerId: customer.id,
        tableId: assignment.table.id,
        confirmationToken,
        confirmedAt: new Date()
      },
      include: {
        customer: true,
        table: {
          include: { zone: true }
        }
      }
    });

    // BUG-09: la visita se registra solo cuando la reserva se crea con éxito
    await customerService.registerVisit(customer.id, tx);

    return created;
  });
  
  logger.info(`✅ Reserva creada: ${booking.id}`);

  // N2.5: auditoría
  recordEvent(booking.id, EVENT_TYPES.CREATED, 'cliente', { source: 'WEB', pax: booking.pax });

  socketManager.emitToBackoffice('new_reservation', {
    id: booking.id,
    date: booking.date,
    pax: booking.pax,
    status: booking.status,
    tableName: booking.table?.name || null,
    zoneName: booking.table?.zone?.name || null,
    customerName: `${customer.firstName} ${customer.lastName}`,
    customerEmail: customer.email
  });
  
  // Enviar email de confirmación
  emailService.sendBookingConfirmation(booking, customer);

  // N1.4: si el cliente estaba en lista de espera para ese día, se resuelve
  waitlistService.resolveForCustomerAndDate(customer.id, date);
  
  res.status(201).json({
    status: 'success',
    message: isNew 
      ? `¡Reserva confirmada! Te hemos enviado un email de confirmación a ${customer.email}`
      : `¡Bienvenido de nuevo, ${customer.firstName}! Reserva confirmada.`,
    data: {
      booking: {
        id: booking.id,
        date: booking.date,
        pax: booking.pax,
        duration: `${booking.duration} minutos`,
        status: booking.status,
        // N1.1: el propio creador recibe el token para autogestionar su reserva
        manageToken: booking.confirmationToken
      },
      customer: {
        name: `${customer.firstName} ${customer.lastName}`,
        email: customer.email,
        isReturningCustomer: !isNew
      },
      table: {
        name: booking.table.name,
        zone: booking.table.zone?.name
      }
    }
  });
});

// ── N1.1: autogestión de reserva por enlace (/reserva/:token) ──────────────

const MANAGEABLE_STATUSES = [
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.RECONFIRMED
];

/** Enmascara un email para la página pública: j***z@e***o.com */
function maskEmail(email) {
  const [user, domain] = String(email || '').split('@');
  if (!domain) return '***';
  const maskPart = (part) =>
    part.length <= 2 ? `${part[0] || '*'}***` : `${part[0]}***${part[part.length - 1]}`;
  const dot = domain.lastIndexOf('.');
  const domainName = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${maskPart(user)}@${maskPart(domainName)}${tld}`;
}

/** Enmascara un teléfono: solo los 3 últimos dígitos */
function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 3 ? `•••••• ${digits.slice(-3)}` : '•••';
}

async function findManagedBooking(token) {
  if (!token || typeof token !== 'string' || token.length < 8) {
    throw new BusinessError('Reserva no encontrada', 'NOT_FOUND', 404);
  }
  const booking = await prisma.booking.findUnique({
    where: { confirmationToken: token },
    include: {
      customer: true,
      table: { include: { zone: true } }
    }
  });
  if (!booking) {
    throw new BusinessError('Reserva no encontrada', 'NOT_FOUND', 404);
  }
  return booking;
}

function isManageable(booking) {
  return (
    MANAGEABLE_STATUSES.includes(booking.status) &&
    new Date(booking.date).getTime() > Date.now()
  );
}

function assertManageable(booking) {
  if (!isManageable(booking)) {
    throw new BusinessError(
      'Este enlace ya no es válido: la reserva no se puede modificar.',
      'TOKEN_EXPIRED',
      410
    );
  }
}

function managedBookingPayload(booking) {
  return {
    booking: {
      date: booking.date,
      pax: booking.pax,
      duration: booking.duration,
      status: booking.status,
      table: booking.table
        ? { name: booking.table.name, zone: booking.table.zone?.name ?? null }
        : null
    },
    // El token es una capacidad de acceso: la página nunca muestra PII completa
    customer: {
      firstName: booking.customer.firstName,
      emailMasked: maskEmail(booking.customer.email),
      phoneMasked: maskPhone(booking.customer.phone)
    },
    canManage: isManageable(booking)
  };
}

/**
 * GET /api/public/reservations/manage/:token
 */
exports.getManagedBooking = asyncHandler(async (req, res) => {
  const booking = await findManagedBooking(req.params.token);
  res.json({ status: 'success', data: managedBookingPayload(booking) });
});

/**
 * POST /api/public/reservations/manage/:token/cancel
 */
exports.cancelManagedBooking = asyncHandler(async (req, res) => {
  const booking = await findManagedBooking(req.params.token);
  assertManageable(booking);

  await prisma.booking.update({
    where: { id: booking.id },
    data: { status: BOOKING_STATUS.CANCELLED, modifiedAt: new Date() }
  });

  logger.info(`🙋 Reserva cancelada por el cliente (autogestión): ${booking.id}`);

  // N2.5: auditoría
  recordEvent(booking.id, EVENT_TYPES.CANCELLED, 'cliente', { via: 'autogestión', from: booking.status });

  socketManager.emitToBackoffice('reservation_cancelled', {
    id: booking.id,
    date: booking.date,
    pax: booking.pax
  });

  emailService.sendBookingCancellation(booking, booking.customer, { byRestaurant: false });

  // N1.4: el hueco liberado se ofrece al primero de la lista de espera
  waitlistService.notifyNextForDate(booking);

  res.json({ status: 'success', message: 'Reserva cancelada correctamente.' });
});

/**
 * POST /api/public/reservations/manage/:token/reschedule
 * Body: { date, time } — mantiene pax y reasigna mesa contra la
 * disponibilidad real (aplican las reglas del canal público).
 */
exports.rescheduleManagedBooking = asyncHandler(async (req, res) => {
  const { date, time } = req.body;
  const booking = await findManagedBooking(req.params.token);
  assertManageable(booking);

  validationService.validateBookingDate(date);
  validationService.validateBookingTime(date, time);

  const updated = await tableAssignmentService.withBookingTransaction(async (tx) => {
    await availabilityService.assertBookableSlot(date, time, booking.pax, {
      db: tx,
      excludeBookingId: booking.id
    });

    const assignment = await tableAssignmentService.assignOptimalTable(
      booking.pax,
      date,
      time,
      null,
      { db: tx, excludeBookingId: booking.id }
    );

    return tx.booking.update({
      where: { id: booking.id },
      data: {
        date: combineDateAndTime(date, time),
        tableId: assignment.table.id,
        modifiedAt: new Date()
      },
      include: {
        customer: true,
        table: { include: { zone: true } }
      }
    });
  });

  logger.info(`🙋 Reserva cambiada de hora por el cliente (autogestión): ${booking.id}`);

  // N2.5: auditoría
  recordEvent(booking.id, EVENT_TYPES.RESCHEDULED, 'cliente', {
    via: 'autogestión',
    fromDate: booking.date,
    toDate: updated.date
  });

  socketManager.emitToBackoffice('reservation_updated', {
    id: updated.id,
    date: updated.date,
    pax: updated.pax,
    status: updated.status,
    tableName: updated.table?.name || null,
    zoneName: updated.table?.zone?.name || null,
    customerName: `${updated.customer.firstName} ${updated.customer.lastName}`
  });

  emailService.sendBookingModification(updated, updated.customer);

  res.json({ status: 'success', data: managedBookingPayload(updated) });
});

// ── N1.2: reconfirmación en un clic desde el email de recordatorio ─────────

/**
 * POST /api/public/reservations/reconfirm/:token
 * Marca la reserva como RECONFIRMED usando el reconfirmToken del recordatorio.
 * Idempotente: reconfirmar dos veces devuelve éxito.
 */
exports.reconfirmBooking = asyncHandler(async (req, res) => {
  const { token } = req.params;
  if (!token || typeof token !== 'string' || token.length < 8) {
    throw new BusinessError('Reserva no encontrada', 'NOT_FOUND', 404);
  }

  const booking = await prisma.booking.findUnique({
    where: { reconfirmToken: token },
    include: {
      customer: true,
      table: { include: { zone: true } }
    }
  });

  if (!booking) {
    throw new BusinessError('Reserva no encontrada', 'NOT_FOUND', 404);
  }

  const future = new Date(booking.date).getTime() > Date.now();

  // Idempotencia: ya reconfirmada → éxito sin tocar nada
  if (booking.status === BOOKING_STATUS.RECONFIRMED) {
    return res.json({ status: 'success', data: managedBookingPayload(booking) });
  }

  if (booking.status !== BOOKING_STATUS.CONFIRMED || !future) {
    throw new BusinessError(
      'Este enlace ya no es válido: la reserva no se puede reconfirmar.',
      'TOKEN_EXPIRED',
      410
    );
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { status: BOOKING_STATUS.RECONFIRMED, reconfirmedAt: new Date() },
    include: {
      customer: true,
      table: { include: { zone: true } }
    }
  });

  logger.info(`👍 Reserva reconfirmada por el cliente: ${booking.id}`);

  // N2.5: auditoría
  recordEvent(booking.id, EVENT_TYPES.RECONFIRMED, 'cliente');

  socketManager.emitToBackoffice('reservation_status_changed', {
    id: updated.id,
    status: updated.status,
    date: updated.date,
    pax: updated.pax
  });

  res.json({ status: 'success', data: managedBookingPayload(updated) });
});

module.exports = exports;
