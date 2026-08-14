
const crypto = require('crypto');
const { Prisma } = require('@prisma/client');
const prisma = require('../../config/database');
const customerService = require('../../services/customerService');
const tableAssignmentService = require('../../services/tableAssignmentService');
const validationService = require('../../services/validationService');
const availabilityService = require('../../services/availabilityService');
const { asyncHandler, BusinessError } = require('../../middleware/errorHandler');
const { combineDateAndTime, formatDate, formatTime } = require('../../utils/dateHelpers');
const { calculateDuration } = require('../../utils/tableHelpers');
const { BOOKING_SOURCE, BOOKING_STATUS } = require('../../config/constants');
const socketManager = require('../../socketManager');
const emailService = require('../../services/emailService');
const reviewRequestService = require('../../services/reviewRequestService');
const waitlistService = require('../../services/waitlistService');
const { recordEvent, actorFromRequest, EVENT_TYPES } = require('../../services/bookingEventService');
const { logger } = require('../../config/logger');

// BUG-12: transiciones de estado permitidas. CANCELLED → CONFIRMED permite
// reactivar; NO_SHOW → CONFIRMED corrige un no-show marcado por error
// (y revierte el contador). COMPLETED es terminal.
const STATUS_TRANSITIONS = {
  [BOOKING_STATUS.PENDING]: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.CANCELLED],
  [BOOKING_STATUS.CONFIRMED]: [BOOKING_STATUS.RECONFIRMED, BOOKING_STATUS.SEATED, BOOKING_STATUS.CANCELLED, BOOKING_STATUS.NO_SHOW],
  [BOOKING_STATUS.RECONFIRMED]: [BOOKING_STATUS.SEATED, BOOKING_STATUS.CANCELLED, BOOKING_STATUS.NO_SHOW],
  [BOOKING_STATUS.SEATED]: [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED],
  [BOOKING_STATUS.COMPLETED]: [],
  [BOOKING_STATUS.CANCELLED]: [BOOKING_STATUS.CONFIRMED],
  [BOOKING_STATUS.NO_SHOW]: [BOOKING_STATUS.CONFIRMED]
};

function assertStatusTransition(currentStatus, nextStatus) {
  const allowed = STATUS_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    throw new BusinessError(
      `Transición de estado no permitida: ${currentStatus} → ${nextStatus}`,
      'INVALID_STATUS_TRANSITION',
      409
    );
  }
}

// BUG-18: payload común para los eventos socket del back-office
function bookingEventPayload(booking) {
  return {
    id: booking.id,
    date: booking.date,
    pax: booking.pax,
    status: booking.status,
    tableName: booking.table?.name || null,
    zoneName: booking.table?.zone?.name || null,
    customerName: booking.customer
      ? `${booking.customer.firstName} ${booking.customer.lastName}`
      : null
  };
}

/**
 * GET /api/backoffice/bookings
 * Lista todas las reservas con filtros
 * Query params: date?, status?, zoneId?, customerId?, limit?, page?
 */
exports.getAllBookings = asyncHandler(async (req, res) => {
  const { date, status, zoneId, customerId, limit = 50, page = 1 } = req.query;
  
  const whereClause = {};
  
  // Filtro por fecha (usando la hora local del sistema/restaurante)
  if (date) {
    // Forzamos que se interprete como el inicio y fin del día en la zona horaria local
    const startOfDay = new Date(`${date}T00:00:00.000`);
    const endOfDay = new Date(`${date}T23:59:59.999`);
    
    whereClause.date = {
      gte: startOfDay,
      lte: endOfDay
    };
  }
  
  // Filtro por estado
  if (status) {
    whereClause.status = status;
  }
  
  // Filtro por zona
  if (zoneId) {
    whereClause.table = {
      zoneId: parseInt(zoneId)
    };
  }
  
  // Filtro por cliente
  if (customerId) {
    whereClause.customerId = customerId;
  }
  
  const take = parseInt(limit);
  const skip = (parseInt(page) - 1) * take;

  // BUG-23: la página se resuelve en SQL (orden por proximidad a ahora +
  // LIMIT/OFFSET). Antes se traían TODOS los ids del filtro a memoria y se
  // paginaba en JavaScript: sin filtro de fecha, cada petición cargaba la
  // tabla entera.
  const conditions = [Prisma.sql`1 = 1`];
  if (whereClause.date) {
    conditions.push(Prisma.sql`b."date" >= ${whereClause.date.gte} AND b."date" <= ${whereClause.date.lte}`);
  }
  if (status) {
    conditions.push(Prisma.sql`b."status"::text = ${status}`);
  }
  if (zoneId) {
    conditions.push(Prisma.sql`t."zoneId" = ${parseInt(zoneId)}`);
  }
  if (customerId) {
    conditions.push(Prisma.sql`b."customerId" = ${customerId}`);
  }
  const whereSql = Prisma.join(conditions, ' AND ');

  const [pageRows, total] = await Promise.all([
    prisma.$queryRaw`
      SELECT b.id
      FROM "Booking" b
      LEFT JOIN "Table" t ON t.id = b."tableId"
      WHERE ${whereSql}
      ORDER BY ABS(EXTRACT(EPOCH FROM (b."date" - NOW()))) ASC
      LIMIT ${take} OFFSET ${skip}`,
    prisma.booking.count({ where: whereClause })
  ]);

  const paginatedIds = (pageRows || []).map((row) => row.id).filter(Boolean);

  const bookings = await prisma.booking.findMany({
    where: {
      id: { in: paginatedIds }
    },
    include: {
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          isVip: true,
          isBlacklisted: true,
          allergens: true,
          tags: true,
          totalVisits: true
        }
      },
      table: {
        include: { zone: true }
      }
    }
  });

  // Re-sort results to match the proximity order (prisma in doesn't guarantee order)
  bookings.sort((a, b) => {
    return paginatedIds.indexOf(a.id) - paginatedIds.indexOf(b.id);
  });
  
  res.json({
    status: 'success',
    data: {
      bookings,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

/**
 * GET /api/backoffice/bookings/:id
 * Obtiene detalles completos de una reserva
 */
exports.getBookingById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      customer: {
        include: {
          notes: {
            orderBy: { createdAt: 'desc' },
            take: 5
          },
          bookings: {
            where: { status: 'COMPLETED' },
            take: 5,
            orderBy: { date: 'desc' }
          }
        }
      },
      table: {
        include: { zone: true }
      }
    }
  });
  
  if (!booking) {
    throw new BusinessError('Reserva no encontrada', 'NOT_FOUND', 404);
  }
  
  res.json({
    status: 'success',
    data: booking
  });
});

/**
 * GET /api/backoffice/bookings/:id/events
 * N2.5: timeline de auditoría de una reserva
 */
exports.getBookingEvents = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const events = await prisma.bookingEvent.findMany({
    where: { bookingId: id },
    orderBy: { createdAt: 'desc' }
  });

  res.json({ status: 'success', data: { events } });
});

/**
 * POST /api/backoffice/bookings
 * Crea una reserva desde el back-office (walk-ins, teléfono)
 */
exports.createBooking = asyncHandler(async (req, res) => {
  const {
    date,
    time,
    pax,
    tableId, // Opcional: puede asignarse automáticamente
    zoneId,
    customer: customerData,
    specialRequests,
    source = BOOKING_SOURCE.BACKOFFICE,
    assignedBy
  } = req.body;
  
  // Validar datos básicos
  await validationService.validateBookingData({
    date,
    time,
    pax,
    ...customerData
  });
  
  const sanitizedRequests = validationService.sanitizeText(specialRequests, 500);
  const sanitizedAllergens = validationService.validateAllergens(customerData.allergens);
  
  // Crear/buscar cliente
  const { customer } = await customerService.findOrCreateCustomer(
    customerData.email,
    {
      ...customerData,
      allergens: sanitizedAllergens
    }
  );
  
  const duration = calculateDuration(parseInt(pax));
  const dateTime = combineDateAndTime(date, time);

  const booking = await tableAssignmentService.withBookingTransaction(async (tx) => {
    await availabilityService.assertBookableSlot(date, time, parseInt(pax), { db: tx });

    let assignedTable = tableId ? parseInt(tableId) : null;

    if (!assignedTable) {
      const assignment = await tableAssignmentService.assignOptimalTable(
        parseInt(pax),
        date,
        time,
        zoneId ? parseInt(zoneId) : null,
        { db: tx }
      );
      assignedTable = assignment.table.id;
    } else {
      const selectedTable = await tx.table.findUnique({ where: { id: assignedTable } });

      if (!selectedTable || !selectedTable.isActive) {
        throw new BusinessError('La mesa seleccionada no existe o está inactiva', 'TABLE_NOT_FOUND', 404);
      }

      if (selectedTable.minCapacity > parseInt(pax) || selectedTable.maxCapacity < parseInt(pax)) {
        throw new BusinessError('La mesa seleccionada no tiene capacidad para esa reserva', 'TABLE_INSUFFICIENT_CAPACITY', 409);
      }

      const endDateTime = new Date(dateTime.getTime() + duration * 60000);
      const isFree = await tableAssignmentService.isTableFree(assignedTable, dateTime, endDateTime, { db: tx });

      if (!isFree) {
        throw new BusinessError('La mesa seleccionada no está disponible', 'TABLE_OCCUPIED', 409);
      }
    }

    const created = await tx.booking.create({
      data: {
        date: dateTime,
        duration,
        pax: parseInt(pax),
        status: BOOKING_STATUS.CONFIRMED,
        source,
        specialRequests: sanitizedRequests || null,
        customerId: customer.id,
        tableId: assignedTable,
        assignedBy: assignedBy || 'Sistema',
        // N1.1: las reservas de back-office también son autogestionables
        confirmationToken: crypto.randomBytes(16).toString('hex'),
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

  logger.info(`✅ Reserva creada (back-office): ${booking.id}`);

  // N2.5: auditoría
  recordEvent(booking.id, EVENT_TYPES.CREATED, actorFromRequest(req), { source, pax: booking.pax });

  // BUG-18: el panel también debe enterarse de las altas hechas desde otro puesto
  socketManager.emitToBackoffice('new_reservation', bookingEventPayload(booking));

  res.status(201).json({
    status: 'success',
    message: 'Reserva creada correctamente',
    data: booking
  });
});

/**
 * POST /api/backoffice/bookings/walkin
 * N2.2: walk-in — ocupa una mesa AHORA con datos mínimos (sin email/teléfono).
 * Usa un cliente sintético compartido ("walkin@local") para no ensuciar el CRM.
 * Body: { tableId, pax, name? }
 */
exports.createWalkIn = asyncHandler(async (req, res) => {
  const { tableId, pax, name } = req.body;

  const numPax = parseInt(pax);
  if (!tableId || !Number.isInteger(numPax) || numPax < 1) {
    throw new BusinessError('Mesa y comensales son obligatorios', 'MISSING_FIELDS', 400);
  }

  const now = new Date();
  const duration = calculateDuration(numPax);
  const endTime = new Date(now.getTime() + duration * 60000);

  const booking = await tableAssignmentService.withBookingTransaction(async (tx) => {
    const table = await tx.table.findUnique({ where: { id: parseInt(tableId) } });
    if (!table || !table.isActive) {
      throw new BusinessError('La mesa seleccionada no existe o está inactiva', 'TABLE_NOT_FOUND', 404);
    }
    if (table.maxCapacity < numPax) {
      throw new BusinessError('La mesa seleccionada no tiene capacidad para ese grupo', 'TABLE_INSUFFICIENT_CAPACITY', 409);
    }

    const isFree = await tableAssignmentService.isTableFree(table.id, now, endTime, { db: tx });
    if (!isFree) {
      throw new BusinessError('La mesa está ocupada ahora mismo', 'TABLE_OCCUPIED', 409);
    }

    // Cliente sintético compartido para todos los walk-ins
    let customer = await tx.customer.findUnique({ where: { email: 'walkin@local' } });
    if (!customer) {
      customer = await tx.customer.create({
        data: {
          email: 'walkin@local',
          phone: '000000000',
          firstName: 'Walk-in',
          lastName: '',
          language: 'es'
        }
      });
    }

    return tx.booking.create({
      data: {
        date: now,
        duration,
        pax: numPax,
        status: BOOKING_STATUS.SEATED,
        source: BOOKING_SOURCE.WALK_IN,
        seatedAt: now,
        confirmedAt: now,
        specialRequests: name ? validationService.sanitizeText(`Walk-in: ${name}`, 200) : null,
        customerId: customer.id,
        tableId: table.id,
        assignedBy: req.user?.name || 'Staff'
      },
      include: {
        customer: true,
        table: { include: { zone: true } }
      }
    });
  });

  logger.info(`🚶 Walk-in sentado en mesa ${booking.table?.name}: ${booking.pax} pax`);

  // N2.5: auditoría
  recordEvent(booking.id, EVENT_TYPES.CREATED, actorFromRequest(req), { source: 'WALK_IN', pax: booking.pax });

  socketManager.emitToBackoffice('new_reservation', bookingEventPayload(booking));

  res.status(201).json({
    status: 'success',
    message: 'Walk-in registrado correctamente',
    data: booking
  });
});

/**
 * PATCH /api/backoffice/bookings/:id
 * Modifica una reserva existente
 */
exports.updateBooking = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { date, time, pax, tableId, specialRequests, status } = req.body;

  if ((date && !time) || (!date && time)) {
    throw new BusinessError('Debe indicar fecha y hora a la vez', 'MISSING_DATE_OR_TIME', 400);
  }

  // N1.3: estado previo para decidir qué email de ciclo de vida enviar
  let previousBooking = null;

  const updated = await tableAssignmentService.withBookingTransaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id },
      include: { table: true }
    });

    if (!booking) {
      throw new BusinessError('Reserva no encontrada', 'NOT_FOUND', 404);
    }
    previousBooking = booking;

    const updateData = { modifiedAt: new Date() };

    // BUG-14: el staff puede operar sobre reservas inminentes; la antelación
    // mínima es una regla del canal público, no del back-office.
    const staffOptions = { skipAdvanceCheck: true, db: tx, excludeBookingId: booking.id };

    if (date && time) {
      validationService.validateBookingDate(date);
      validationService.validateBookingTime(date, time, staffOptions);
      await availabilityService.assertBookableSlot(date, time, parseInt(pax || booking.pax), staffOptions);
      updateData.date = combineDateAndTime(date, time);
    }

    if (pax) {
      const paxValidation = await validationService.validatePaxCount(pax);
      if (!paxValidation.valid) {
        throw new BusinessError(paxValidation.message, paxValidation.code, 400);
      }

      updateData.pax = parseInt(pax);
      updateData.duration = calculateDuration(parseInt(pax));

      const currentDate = date ? date : formatDate(booking.date);
      const currentTime = date && time ? time : formatTime(booking.date);
      await availabilityService.assertBookableSlot(currentDate, currentTime, updateData.pax, staffOptions);
    }

    const nextDateTime = updateData.date || booking.date;
    const nextDuration = updateData.duration || booking.duration;
    const nextPax = updateData.pax || booking.pax;
    const requestedTableId = tableId ? parseInt(tableId) : booking.tableId;

    if (!requestedTableId) {
      throw new BusinessError('La reserva debe tener una mesa asignada', 'MISSING_TABLE_ID', 409);
    }

    const selectedTable = await tx.table.findUnique({ where: { id: requestedTableId } });
    if (!selectedTable || !selectedTable.isActive) {
      throw new BusinessError('La mesa seleccionada no existe o está inactiva', 'TABLE_NOT_FOUND', 404);
    }

    if (selectedTable.minCapacity > nextPax || selectedTable.maxCapacity < nextPax) {
      throw new BusinessError('La mesa seleccionada no tiene capacidad para esa reserva', 'TABLE_INSUFFICIENT_CAPACITY', 409);
    }

    const endDateTime = new Date(nextDateTime.getTime() + nextDuration * 60000);
    const isFree = await tableAssignmentService.isTableFree(requestedTableId, nextDateTime, endDateTime, {
      db: tx,
      excludeBookingId: id
    });

    if (!isFree) {
      throw new BusinessError('La mesa seleccionada no está disponible', 'TABLE_OCCUPIED', 409);
    }

    if (tableId) {
      updateData.tableId = requestedTableId;
    }

    if (specialRequests !== undefined) {
      updateData.specialRequests = validationService.sanitizeText(specialRequests, 500);
    }

    if (status) {
      if (!Object.values(BOOKING_STATUS).includes(status)) {
        throw new BusinessError('Estado inválido', 'INVALID_STATUS', 400);
      }
      // BUG-12: mismas reglas de transición y efectos que en /status
      assertStatusTransition(booking.status, status);
      updateData.status = status;

      if (status === BOOKING_STATUS.SEATED && !booking.seatedAt) {
        updateData.seatedAt = new Date();
      }
      if (status === BOOKING_STATUS.COMPLETED && !booking.completedAt) {
        updateData.completedAt = new Date();
      }
      if (status === BOOKING_STATUS.NO_SHOW) {
        await tx.customer.update({
          where: { id: booking.customerId },
          data: { totalNoShows: { increment: 1 } }
        });
      }
      if (booking.status === BOOKING_STATUS.NO_SHOW && status === BOOKING_STATUS.CONFIRMED) {
        await tx.customer.update({
          where: { id: booking.customerId },
          data: { totalNoShows: { decrement: 1 } }
        });
      }
    }

    return tx.booking.update({
      where: { id },
      data: updateData,
      include: {
        customer: true,
        table: {
          include: { zone: true }
        }
      }
    });
  });

  logger.info(`📝 Reserva actualizada: ${id}`);

  // N2.5: auditoría con snapshot del cambio
  const actor = actorFromRequest(req);
  if (previousBooking.status !== updated.status) {
    recordEvent(id, EVENT_TYPES.STATUS_CHANGED, actor, {
      from: previousBooking.status,
      to: updated.status
    });
  }
  if (new Date(updated.date).getTime() !== new Date(previousBooking.date).getTime()) {
    recordEvent(id, EVENT_TYPES.RESCHEDULED, actor, {
      fromDate: previousBooking.date,
      toDate: updated.date
    });
  } else if (previousBooking.status === updated.status) {
    recordEvent(id, EVENT_TYPES.MODIFIED, actor, {
      pax: updated.pax,
      tableId: updated.tableId ?? null
    });
  }

  // BUG-18
  socketManager.emitToBackoffice('reservation_updated', bookingEventPayload(updated));

  // N1.3: emails de ciclo de vida (fire-and-forget, como la confirmación)
  if (updated.customer) {
    if (previousBooking.status !== BOOKING_STATUS.CANCELLED && updated.status === BOOKING_STATUS.CANCELLED) {
      emailService.sendBookingCancellation(updated, updated.customer, { byRestaurant: true });
      // N1.4: el hueco liberado se ofrece al primero de la lista de espera
      waitlistService.notifyNextForDate(updated);
    } else if (new Date(updated.date).getTime() !== new Date(previousBooking.date).getTime()) {
      emailService.sendBookingModification(updated, updated.customer);
    }
    // N3.4: al completarse la visita, petición de reseña (si está activada)
    if (previousBooking.status !== BOOKING_STATUS.COMPLETED && updated.status === BOOKING_STATUS.COMPLETED) {
      reviewRequestService.maybeSendReviewRequest(updated);
    }
  }

  res.json({
    status: 'success',
    message: 'Reserva actualizada correctamente',
    data: updated
  });
});

/**
 * DELETE /api/backoffice/bookings/:id
 * Elimina una reserva (soft delete - marca como cancelada)
 */
exports.deleteBooking = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      customer: true,
      table: { include: { zone: true } }
    }
  });

  if (!booking) {
    throw new BusinessError('Reserva no encontrada', 'NOT_FOUND', 404);
  }

  // BUG-12: cancelar también es una transición de estado
  assertStatusTransition(booking.status, BOOKING_STATUS.CANCELLED);

  await prisma.booking.update({
    where: { id },
    data: {
      status: BOOKING_STATUS.CANCELLED,
      modifiedAt: new Date()
    }
  });

  // N2.5: auditoría
  recordEvent(booking.id, EVENT_TYPES.CANCELLED, actorFromRequest(req), { from: booking.status });

  // BUG-18
  socketManager.emitToBackoffice('reservation_cancelled', {
    id: booking.id,
    date: booking.date,
    pax: booking.pax
  });

  // N1.3: aviso de cancelación al cliente
  if (booking.customer) {
    emailService.sendBookingCancellation(booking, booking.customer, { byRestaurant: true });
  }

  // N1.4: el hueco liberado se ofrece al primero de la lista de espera
  waitlistService.notifyNextForDate(booking);

  res.json({
    status: 'success',
    message: 'Reserva cancelada correctamente'
  });
});

/**
 * PATCH /api/backoffice/bookings/:id/status
 * Cambia rápidamente el estado de una reserva
 */
exports.updateBookingStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !Object.values(BOOKING_STATUS).includes(status)) {
    throw new BusinessError('Estado inválido', 'INVALID_STATUS', 400);
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      customer: true,
      table: { include: { zone: true } }
    }
  });

  if (!booking) {
    throw new BusinessError('Reserva no encontrada', 'NOT_FOUND', 404);
  }

  // BUG-12: validar la transición (también evita NO_SHOW → NO_SHOW,
  // que antes duplicaba el contador)
  assertStatusTransition(booking.status, status);

  const updateData = {
    status,
    modifiedAt: new Date()
  };

  // Marcar timestamps
  if (status === BOOKING_STATUS.SEATED) {
    updateData.seatedAt = new Date();
  }
  if (status === BOOKING_STATUS.COMPLETED) {
    updateData.completedAt = new Date();
  }

  // BUG-12: el contador de no-shows sigue a la transición, no a la petición
  if (status === BOOKING_STATUS.NO_SHOW) {
    await prisma.customer.update({
      where: { id: booking.customerId },
      data: { totalNoShows: { increment: 1 } }
    });
  }
  if (booking.status === BOOKING_STATUS.NO_SHOW && status === BOOKING_STATUS.CONFIRMED) {
    await prisma.customer.update({
      where: { id: booking.customerId },
      data: { totalNoShows: { decrement: 1 } }
    });
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: updateData
  });

  // N2.5: auditoría
  recordEvent(booking.id, EVENT_TYPES.STATUS_CHANGED, actorFromRequest(req), {
    from: booking.status,
    to: status
  });

  // BUG-18
  socketManager.emitToBackoffice('reservation_status_changed', {
    id: booking.id,
    status,
    date: booking.date,
    pax: booking.pax
  });

  // N1.3: aviso de cancelación al cliente
  if (status === BOOKING_STATUS.CANCELLED && booking.customer) {
    emailService.sendBookingCancellation(booking, booking.customer, { byRestaurant: true });
  }

  // N1.4: el hueco liberado se ofrece al primero de la lista de espera
  if (status === BOOKING_STATUS.CANCELLED) {
    waitlistService.notifyNextForDate(booking);
  }

  // N3.4: al completarse la visita, petición de reseña (si está activada)
  if (status === BOOKING_STATUS.COMPLETED) {
    reviewRequestService.maybeSendReviewRequest(booking);
  }

  res.json({
    status: 'success',
    message: `Estado cambiado a ${status}`,
    data: updated
  });
});

/**
 * POST /api/backoffice/bookings/:id/reassign
 * Reasigna una reserva a otra mesa (drag & drop)
 */
exports.reassignTable = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tableId } = req.body;
  
  if (!tableId) {
    throw new BusinessError('Se requiere el ID de la nueva mesa', 'MISSING_TABLE_ID', 400);
  }
  
  const result = await tableAssignmentService.reassignBooking(id, parseInt(tableId));

  // N2.5: auditoría del cambio de mesa
  recordEvent(id, EVENT_TYPES.TABLE_REASSIGNED, actorFromRequest(req), {
    toTableId: parseInt(tableId),
    toTableName: result.data?.table?.name ?? null
  });

  // BUG-18
  socketManager.emitToBackoffice('reservation_updated', bookingEventPayload(result.data));

  res.json({
    status: 'success',
    ...result
  });
});

module.exports = exports;
