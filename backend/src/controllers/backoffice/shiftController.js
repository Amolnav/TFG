
const prisma = require('../../config/database');
const { asyncHandler, BusinessError, ValidationError } = require('../../middleware/errorHandler');

// BUG-17: sin estas validaciones, un slotInterval <= 0 colgaba el servidor
// (bucle infinito en generateTimeSlots) y horas/días corruptos rompían
// silenciosamente toda la disponibilidad.
const TIME_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/;

function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function validateShiftUpdate({ startTime, endTime, slotInterval, daysOfWeek, maxBookingsPerSlot }, currentShift) {
  if (startTime !== undefined && !TIME_FORMAT.test(String(startTime))) {
    throw new ValidationError('startTime debe tener formato HH:mm (00:00 - 23:59)');
  }

  if (endTime !== undefined && !TIME_FORMAT.test(String(endTime))) {
    throw new ValidationError('endTime debe tener formato HH:mm (00:00 - 23:59)');
  }

  const effectiveStart = startTime !== undefined ? startTime : currentShift.startTime;
  const effectiveEnd = endTime !== undefined ? endTime : currentShift.endTime;
  if (timeToMinutes(effectiveStart) >= timeToMinutes(effectiveEnd)) {
    throw new ValidationError('startTime debe ser anterior a endTime');
  }

  if (slotInterval !== undefined) {
    const interval = Number(slotInterval);
    if (!Number.isInteger(interval) || interval <= 0) {
      throw new ValidationError('slotInterval debe ser un número entero mayor que 0 (minutos)');
    }
  }

  if (daysOfWeek !== undefined) {
    const isValid = Array.isArray(daysOfWeek) &&
      daysOfWeek.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    if (!isValid) {
      throw new ValidationError('daysOfWeek debe ser un array de enteros entre 0 (domingo) y 6 (sábado)');
    }
  }

  // M4: límite de cocina por slot (null = sin límite)
  if (maxBookingsPerSlot !== undefined && maxBookingsPerSlot !== null) {
    const cap = Number(maxBookingsPerSlot);
    if (!Number.isInteger(cap) || cap <= 0) {
      throw new ValidationError('maxBookingsPerSlot debe ser un entero mayor que 0, o null para desactivarlo');
    }
  }
}

/**
 * GET /api/backoffice/shifts
 * Lista todos los turnos
 */
exports.getAllShifts = asyncHandler(async (req, res) => {
  const shifts = await prisma.shift.findMany({
    orderBy: { startTime: 'asc' }
  });

  res.json({
    status: 'success',
    data: { shifts }
  });
});

/**
 * POST /api/backoffice/shifts (M4)
 * Crear un turno nuevo
 * Body: { name, startTime, endTime, slotInterval?, daysOfWeek, isActive?, maxBookingsPerSlot? }
 */
exports.createShift = asyncHandler(async (req, res) => {
  const { name, startTime, endTime, slotInterval = 30, daysOfWeek, isActive = true, maxBookingsPerSlot = null } = req.body;

  if (!name || !String(name).trim()) {
    throw new ValidationError('El nombre del turno es obligatorio');
  }
  if (startTime === undefined || endTime === undefined) {
    throw new ValidationError('startTime y endTime son obligatorios');
  }
  if (!Array.isArray(daysOfWeek) || daysOfWeek.length === 0) {
    throw new ValidationError('daysOfWeek debe incluir al menos un día (0-6)');
  }

  // Reutiliza las validaciones de formato/coherencia del PATCH
  validateShiftUpdate({ startTime, endTime, slotInterval, daysOfWeek, maxBookingsPerSlot }, { startTime, endTime });

  const shift = await prisma.shift.create({
    data: {
      name: String(name).trim(),
      startTime,
      endTime,
      slotInterval: parseInt(slotInterval),
      daysOfWeek,
      isActive: Boolean(isActive),
      maxBookingsPerSlot: maxBookingsPerSlot === null ? null : parseInt(maxBookingsPerSlot)
    }
  });

  res.status(201).json({
    status: 'success',
    message: 'Turno creado correctamente',
    data: shift
  });
});

/**
 * PATCH /api/backoffice/shifts/:id
 * Modificar horario o días del turno
 * Body: { startTime?, endTime?, slotInterval?, isActive?, daysOfWeek?, maxBookingsPerSlot? }
 */
exports.updateShift = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { startTime, endTime, slotInterval, isActive, daysOfWeek, maxBookingsPerSlot } = req.body;

  const shift = await prisma.shift.findUnique({ where: { id: parseInt(id) } });

  if (!shift) {
    throw new BusinessError('Turno no encontrado', 'NOT_FOUND', 404);
  }

  validateShiftUpdate({ startTime, endTime, slotInterval, daysOfWeek, maxBookingsPerSlot }, shift);

  const updateData = {};
  if (startTime !== undefined) updateData.startTime = startTime;
  if (endTime !== undefined) updateData.endTime = endTime;
  if (slotInterval !== undefined) updateData.slotInterval = parseInt(slotInterval);
  if (isActive !== undefined) updateData.isActive = Boolean(isActive);
  if (daysOfWeek !== undefined) updateData.daysOfWeek = daysOfWeek;
  if (maxBookingsPerSlot !== undefined) {
    updateData.maxBookingsPerSlot = maxBookingsPerSlot === null ? null : parseInt(maxBookingsPerSlot);
  }

  const updated = await prisma.shift.update({
    where: { id: parseInt(id) },
    data: updateData
  });

  res.json({
    status: 'success',
    message: 'Turno actualizado correctamente',
    data: updated
  });
});

/**
 * DELETE /api/backoffice/shifts/:id (M4)
 * Eliminar un turno (sus cierres asociados pasan a cierre global histórico)
 */
exports.deleteShift = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const shiftId = parseInt(id);

  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });

  if (!shift) {
    throw new BusinessError('Turno no encontrado', 'NOT_FOUND', 404);
  }

  // Los cierres que apuntaban solo a este turno dejan de tener sentido
  await prisma.closure.deleteMany({ where: { shiftId } });
  await prisma.shift.delete({ where: { id: shiftId } });

  res.json({
    status: 'success',
    message: 'Turno eliminado correctamente'
  });
});

module.exports = exports;
