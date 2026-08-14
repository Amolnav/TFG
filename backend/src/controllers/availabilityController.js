const availabilityService = require('../services/availabilityService');
const validationService = require('../services/validationService');
const configService = require('../services/configService');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../config/logger');

/**
 * GET /api/public/availability/config
 * Obtiene configuración pública (ej. max comensales)
 */
exports.getPublicConfig = asyncHandler(async (req, res) => {
  const maxPax = await configService.getMaxPax();
  // N3.1: el calendario del wizard necesita la ventana de reserva para
  // limitar la navegación por meses
  const maxDaysAhead = parseInt(await configService.getConfigValue('booking_max_days_ahead'), 10) || 30;

  res.json({
    status: 'success',
    data: {
      maxPax,
      maxDaysAhead
    }
  });
});

/**
 * GET /api/public/availability/calendar
 * Obtiene días disponibles en un mes
 * Query params: year, month, pax, zoneId (opcional)
 */
exports.getAvailableCalendar = asyncHandler(async (req, res) => {
  const { year, month, pax, zoneId } = req.query;
  
  // Validaciones
  const numYear = parseInt(year);
  const numMonth = parseInt(month);
  const numPax = parseInt(pax);
  
  if (!numYear || !numMonth || !numPax) {
    return res.status(400).json({
      status: 'error',
      message: 'Parámetros requeridos: year, month, pax'
    });
  }
  
  if (numMonth < 1 || numMonth > 12) {
    return res.status(400).json({
      status: 'error',
      message: 'El mes debe estar entre 1 y 12'
    });
  }
  
  // Validar número de comensales
  const paxValidation = await validationService.validatePaxCount(numPax);
  if (!paxValidation.valid) {
    return res.status(400).json({
      status: 'error',
      message: paxValidation.message,
      code: paxValidation.code
    });
  }
  
  // Obtener días disponibles
  const availableDays = await availabilityService.getAvailableDaysInMonth(
    numYear,
    numMonth,
    numPax,
    zoneId ? parseInt(zoneId) : null
  );
  
  res.json({
    status: 'success',
    data: {
      year: numYear,
      month: numMonth,
      pax: numPax,
      zoneId: zoneId || null,
      availableDays,
      count: availableDays.length
    }
  });
});

/**
 * POST /api/public/availability/times
 * Obtiene horas disponibles para un día específico
 * Body: { date, pax, zoneId? }
 */
exports.getAvailableTimes = asyncHandler(async (req, res) => {
  const { date, pax, zoneId } = req.body;
  
  // Validaciones
  if (!date || !pax) {
    return res.status(400).json({
      status: 'error',
      message: 'Parámetros requeridos: date, pax'
    });
  }
  
  validationService.validateBookingDate(date);
  
  const paxValidation = await validationService.validatePaxCount(pax);
  if (!paxValidation.valid) {
    return res.status(400).json({
      status: 'error',
      message: paxValidation.message,
      code: paxValidation.code
    });
  }
  
  // Obtener horas disponibles
  const result = await availabilityService.getAvailableTimesForDay(
    date,
    parseInt(pax),
    zoneId ? parseInt(zoneId) : null
  );
  
  res.json({
    status: 'success',
    data: {
      date,
      pax: parseInt(pax),
      ...result
    }
  });
});

/**
 * POST /api/public/availability/check
 * Comprueba disponibilidad en una hora específica y sugiere alternativas
 * Body: { date, time, pax, zoneId? }
 */
exports.checkAvailability = asyncHandler(async (req, res) => {
  const { date, time, pax, zoneId } = req.body;
  
  // Validaciones
  if (!date || !time || !pax) {
    return res.status(400).json({
      status: 'error',
      message: 'Parámetros requeridos: date, time, pax'
    });
  }
  
  validationService.validateBookingDate(date);
  validationService.validateBookingTime(date, time);
  
  const paxValidation = await validationService.validatePaxCount(pax);
  if (!paxValidation.valid) {
    return res.status(400).json({
      status: 'error',
      message: paxValidation.message,
      code: paxValidation.code
    });
  }
  
  logger.info(`🔍 Comprobando disponibilidad: ${date} ${time} (${pax} pax)`);
  
  // Comprobar disponibilidad
  const result = await availabilityService.checkAvailability(
    date,
    time,
    parseInt(pax),
    zoneId ? parseInt(zoneId) : null
  );
  
  res.json({
    status: 'success',
    data: {
      date,
      time,
      pax: parseInt(pax),
      ...result
    }
  });
});

module.exports = exports;