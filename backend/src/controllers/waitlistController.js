
const prisma = require('../config/database');
const waitlistService = require('../services/waitlistService');
const validationService = require('../services/validationService');
const configService = require('../services/configService');
const { asyncHandler, BusinessError, ValidationError } = require('../middleware/errorHandler');

// N1.4: lista de espera — alta pública desde el wizard y gestión en el panel.

/**
 * POST /api/public/reservations/waitlist
 * Body: { date, pax, notes?, customer: { firstName, lastName, email, phone } }
 */
exports.joinWaitlist = asyncHandler(async (req, res) => {
  const { date, pax, notes, customer: customerData = {} } = req.body;

  const enabled = (await configService.getConfigValue('waitlist_enabled')) === 'true';
  if (!enabled) {
    throw new BusinessError('La lista de espera no está activada.', 'NOT_FOUND', 404);
  }

  const errors = [];
  try {
    validationService.validateBookingDate(date);
  } catch (e) {
    errors.push(e.message);
  }
  const paxValidation = await validationService.validatePaxCount(pax);
  if (!paxValidation.valid) errors.push(paxValidation.message);
  try {
    validationService.validateCustomerData(customerData);
  } catch (e) {
    if (e.details && Array.isArray(e.details)) errors.push(...e.details);
    else errors.push(e.message);
  }
  if (errors.length > 0) {
    throw new ValidationError('Datos de lista de espera inválidos', errors);
  }

  const { entry, created } = await waitlistService.joinWaitlist({
    date,
    pax,
    notes: validationService.sanitizeText(notes, 300),
    customerData: {
      ...customerData,
      allergens: validationService.validateAllergens(customerData.allergens)
    }
  });

  res.status(created ? 201 : 200).json({
    status: 'success',
    message: created
      ? 'Te avisaremos por email si queda una mesa libre.'
      : 'Ya estabas en la lista de espera para ese día.',
    data: {
      waitlist: {
        id: entry.id,
        date: entry.date,
        pax: entry.pax,
        alreadyJoined: !created
      }
    }
  });
});

/**
 * GET /api/backoffice/waitlist
 * Query: date?, includeResolved?
 */
exports.listWaitlist = asyncHandler(async (req, res) => {
  const { date, includeResolved } = req.query;

  const where = {};
  if (includeResolved !== 'true') where.isResolved = false;
  if (date) {
    where.date = {
      gte: new Date(`${date}T00:00:00.000`),
      lte: new Date(`${date}T23:59:59.999`)
    };
  }

  const entries = await prisma.waitlist.findMany({
    where,
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    include: {
      customer: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, isVip: true }
      }
    }
  });

  res.json({ status: 'success', data: { waitlist: entries } });
});

/**
 * PATCH /api/backoffice/waitlist/:id/resolve
 */
exports.resolveWaitlistEntry = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const entry = await prisma.waitlist.findFirst({ where: { id } });
  if (!entry) {
    throw new BusinessError('Entrada de lista de espera no encontrada', 'NOT_FOUND', 404);
  }

  const updated = await prisma.waitlist.update({
    where: { id },
    data: { isResolved: true, resolvedAt: new Date() }
  });

  res.json({ status: 'success', data: { waitlist: updated } });
});

/**
 * DELETE /api/backoffice/waitlist/:id
 */
exports.deleteWaitlistEntry = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const entry = await prisma.waitlist.findFirst({ where: { id } });
  if (!entry) {
    throw new BusinessError('Entrada de lista de espera no encontrada', 'NOT_FOUND', 404);
  }

  await prisma.waitlist.delete({ where: { id } });

  res.json({ status: 'success', message: 'Entrada eliminada de la lista de espera.' });
});

module.exports = exports;
