
const prisma = require('../../config/database');
const { asyncHandler, BusinessError, ValidationError } = require('../../middleware/errorHandler');
const { BOOKING_STATUS } = require('../../config/constants');

// BUG-13: el borrado físico de mesas/zonas deja las reservas futuras con
// tableId = NULL (SetNull), invisibles para el plano y la disponibilidad.
// Antes de borrar hay que comprobar que no haya reservas futuras activas.
const INACTIVE_STATUSES = [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.NO_SHOW];

async function countFutureActiveBookings(where) {
  return prisma.booking.count({
    where: {
      ...where,
      date: { gte: new Date() },
      status: { notIn: INACTIVE_STATUSES }
    }
  });
}

/**
 * GET /api/backoffice/zones
 * Lista todas las zonas con sus mesas
 */
exports.getAllZones = asyncHandler(async (req, res) => {
  const showAll = req.query.all === 'true';

  const zones = await prisma.zone.findMany({
    where: showAll ? undefined : { isActive: true },
    include: {
      tables: {
        where: showAll ? undefined : { isActive: true },
        orderBy: { name: 'asc' }
      },
      _count: {
        select: { tables: true }
      }
    },
    orderBy: { displayOrder: 'asc' }
  });

  res.json({
    status: 'success',
    data: { zones }
  });
});

/**
 * POST /api/backoffice/zones
 * Crea una nueva zona
 */
exports.createZone = asyncHandler(async (req, res) => {
  const { name, description, isActive, displayOrder } = req.body;

  // BUG-31: sin esta validación, un nombre ausente acababa en error de
  // Prisma → 500 DATABASE_ERROR en vez de un 400 claro
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new ValidationError('El nombre de la zona es obligatorio');
  }

  const newZone = await prisma.zone.create({
    data: {
      name,
      description,
      isActive: isActive !== undefined ? isActive : true,
      displayOrder: displayOrder || 0
    }
  });
  res.status(201).json({ status: 'success', data: newZone });
});

/**
 * PUT /api/backoffice/zones/:id
 * Actualiza una zona
 */
exports.updateZone = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, isActive, displayOrder } = req.body;
  
  const updatedZone = await prisma.zone.update({
    where: { id: parseInt(id, 10) },
    data: { name, description, isActive, displayOrder }
  });
  res.json({ status: 'success', data: updatedZone });
});

/**
 * POST /api/backoffice/zones/:zoneId/tables
 * Añade una mesa a una zona
 */
exports.createTable = asyncHandler(async (req, res) => {
  const { zoneId } = req.params;
  const { name, minCapacity, maxCapacity, isActive } = req.body;

  // BUG-31: validar nombre y coherencia de capacidades (una mesa con
  // min > max jamás sería asignable por el motor de reservas)
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new ValidationError('El nombre de la mesa es obligatorio');
  }
  const min = parseInt(minCapacity, 10) || 1;
  const max = parseInt(maxCapacity, 10) || 4;
  if (min < 1 || max < 1 || min > max) {
    throw new ValidationError('Capacidades inválidas: minCapacity debe ser ≥ 1 y ≤ maxCapacity');
  }

  const newTable = await prisma.table.create({
    data: {
      name,
      minCapacity: min,
      maxCapacity: max,
      isActive: isActive !== undefined ? isActive : true,
      zoneId: parseInt(zoneId, 10)
    }
  });
  res.status(201).json({ status: 'success', data: newTable });
});

/**
 * PUT /api/backoffice/zones/tables/:tableId
 * Actualiza una mesa
 */
exports.updateTable = asyncHandler(async (req, res) => {
  const { tableId } = req.params;
  const { name, minCapacity, maxCapacity, isActive, zoneId } = req.body;
  
  const data = {};
  if (name !== undefined) data.name = name;
  if (minCapacity !== undefined) data.minCapacity = parseInt(minCapacity, 10);
  if (maxCapacity !== undefined) data.maxCapacity = parseInt(maxCapacity, 10);
  if (isActive !== undefined) data.isActive = isActive;
  if (zoneId !== undefined) data.zoneId = parseInt(zoneId, 10);
  
  const updatedTable = await prisma.table.update({
    where: { id: parseInt(tableId, 10) },
    data
  });
  res.json({ status: 'success', data: updatedTable });
});

/**
 * DELETE /api/backoffice/zones/tables/:tableId
 * Elimina una mesa permanentemente
 */
exports.deleteTable = asyncHandler(async (req, res) => {
  const { tableId } = req.params;
  const id = parseInt(tableId, 10);

  const futureBookings = await countFutureActiveBookings({ tableId: id });
  if (futureBookings > 0) {
    throw new BusinessError(
      `No se puede eliminar la mesa: tiene ${futureBookings} reserva(s) futura(s) activa(s). Cancélalas o reasígnalas primero.`,
      'TABLE_HAS_ACTIVE_BOOKINGS',
      409,
      { futureBookings }
    );
  }

  await prisma.table.delete({
    where: { id }
  });

  res.json({ status: 'success', data: null, message: 'Mesa eliminada correctamente' });
});

/**
 * DELETE /api/backoffice/zones/:id
 * Elimina una zona permanentemente
 */
exports.deleteZone = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const zoneId = parseInt(id, 10);

  const futureBookings = await countFutureActiveBookings({ table: { zoneId } });
  if (futureBookings > 0) {
    throw new BusinessError(
      `No se puede eliminar la zona: sus mesas tienen ${futureBookings} reserva(s) futura(s) activa(s). Cancélalas o reasígnalas primero.`,
      'ZONE_HAS_ACTIVE_BOOKINGS',
      409,
      { futureBookings }
    );
  }

  await prisma.zone.delete({
    where: { id: zoneId }
  });

  res.json({ status: 'success', data: null, message: 'Zona eliminada correctamente' });
});

module.exports = exports;
