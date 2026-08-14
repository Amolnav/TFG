
const prisma = require('../../config/database');
const { asyncHandler, BusinessError } = require('../../middleware/errorHandler');
const { BOOKING_STATUS } = require('../../config/constants');
const { formatTime } = require('../../utils/dateHelpers');
const socketManager = require('../../socketManager');
const emailService = require('../../services/emailService');
const { recordEvent, actorFromRequest, EVENT_TYPES } = require('../../services/bookingEventService');
const { logger } = require('../../config/logger');

// N1.3: estados que siguen "vivos" y deben avisarse ante un cierre sobrevenido
const ACTIVE_STATUSES = [
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.RECONFIRMED
];

/**
 * GET /api/backoffice/closures
 * Lista de cierres (activos y futuros)
 */
exports.getAllClosures = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const closures = await prisma.closure.findMany({
    where: {
      OR: [
        { endDate: { gte: today } },
        { endDate: null, startDate: { gte: today } }
      ]
    },
    include: { shift: true },
    orderBy: { startDate: 'asc' }
  });

  res.json({
    status: 'success',
    data: { closures }
  });
});

/**
 * GET /api/backoffice/closures/all
 * Lista todos los cierres incluyendo pasados
 */
exports.getAllClosuresHistory = asyncHandler(async (req, res) => {
  const closures = await prisma.closure.findMany({
    include: { shift: true },
    orderBy: { startDate: 'desc' },
    take: 100
  });

  res.json({
    status: 'success',
    data: { closures }
  });
});

/**
 * POST /api/backoffice/closures
 * Crear un cierre
 * Body: { startDate, endDate?, reason, isFullDay?, shiftId? }
 */
exports.createClosure = asyncHandler(async (req, res) => {
  const { startDate, endDate, reason, isFullDay = true, shiftId, notifyAffected = false } = req.body;

  if (!startDate || !reason) {
    throw new BusinessError(
      'La fecha de inicio y el motivo son obligatorios',
      'MISSING_FIELDS',
      400
    );
  }

  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;

  if (end && end < start) {
    throw new BusinessError(
      'La fecha de fin no puede ser anterior a la de inicio',
      'INVALID_DATE_RANGE',
      400
    );
  }

  const closure = await prisma.closure.create({
    data: {
      startDate: start,
      endDate: end,
      reason: reason.trim(),
      isFullDay: Boolean(isFullDay),
      shiftId: shiftId ? parseInt(shiftId) : null,
      createdBy: req.user?.name || 'Staff'
    },
    include: { shift: true }
  });

  logger.info(`🚫 Cierre creado: ${closure.reason} (${startDate})`);

  // N1.3: cierre sobrevenido — si el staff lo pide explícitamente, las
  // reservas vivas afectadas se cancelan y el cliente recibe un email con
  // disculpa y enlace para re-reservar.
  let cancelledBookings = 0;
  if (notifyAffected) {
    const dayStartStr = String(startDate).slice(0, 10);
    const dayEndStr = String(endDate || startDate).slice(0, 10);
    const rangeStart = new Date(`${dayStartStr}T00:00:00.000`);
    const rangeEnd = new Date(`${dayEndStr}T23:59:59.999`);

    let affected = await prisma.booking.findMany({
      where: {
        date: { gte: rangeStart, lte: rangeEnd },
        status: { in: ACTIVE_STATUSES }
      },
      include: {
        customer: true,
        table: { include: { zone: true } }
      }
    });

    // Cierre por turno: solo afectan las reservas dentro de la franja del turno
    if (closure.shiftId && closure.shift && !closure.isFullDay) {
      affected = affected.filter((booking) => {
        const time = formatTime(booking.date);
        return time >= closure.shift.startTime && time < closure.shift.endTime;
      });
    }

    for (const booking of affected) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: BOOKING_STATUS.CANCELLED, modifiedAt: new Date() }
      });
      // N2.5: auditoría
      recordEvent(booking.id, EVENT_TYPES.CANCELLED, actorFromRequest(req), {
        via: 'cierre',
        reason: closure.reason
      });
      socketManager.emitToBackoffice('reservation_cancelled', {
        id: booking.id,
        date: booking.date,
        pax: booking.pax
      });
      emailService.sendClosureNotice(booking, booking.customer, { reason: closure.reason });
    }

    cancelledBookings = affected.length;
    if (cancelledBookings > 0) {
      logger.info(`🚫 Cierre sobrevenido: ${cancelledBookings} reservas canceladas y avisadas por email`);
    }
  }

  res.status(201).json({
    status: 'success',
    message: 'Cierre registrado correctamente',
    data: { ...closure, cancelledBookings }
  });
});

/**
 * DELETE /api/backoffice/closures/:id
 * Eliminar un cierre
 */
exports.deleteClosure = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const closure = await prisma.closure.findUnique({ where: { id } });

  if (!closure) {
    throw new BusinessError('Cierre no encontrado', 'NOT_FOUND', 404);
  }

  await prisma.closure.delete({ where: { id } });

  res.json({
    status: 'success',
    message: 'Cierre eliminado correctamente'
  });
});

module.exports = exports;
