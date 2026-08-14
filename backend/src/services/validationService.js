const { getBookingRules } = require('../config/bookingRules');
const { ValidationError } = require('../middleware/errorHandler');
const { isDateInBookableRange, meetsMinimumAdvanceTime } = require('../utils/dateHelpers');
const prisma = require('../config/database');

/**
 * Valida el número de comensales de forma dinámica
 */
async function validatePaxCount(pax) {
  const numPax = parseInt(pax);
  
  if (isNaN(numPax) || numPax < 1) {
    return {
      valid: false,
      message: 'El número de comensales debe ser un número válido mayor a 0',
      code: 'PAX_INVALID'
    };
  }
  
  const { paxMin } = getBookingRules();
  if (numPax < paxMin) {
    return {
      valid: false,
      message: `Las reservas deben ser de al menos ${paxMin} comensales. Para otros casos, contacte directamente con el restaurante.`,
      code: 'PAX_BELOW_MIN'
    };
  }

  // Obtener el máximo real de la base de datos (mayor mesa) — getMaxPax()
  // es la única fuente del máximo; 12 es solo el fallback sin mesas
  const maxTable = await prisma.table.findFirst({
    where: { isActive: true },
    orderBy: { maxCapacity: 'desc' }
  });

  const currentMax = maxTable ? maxTable.maxCapacity : 12;
  
  if (numPax > currentMax) {
    return {
      valid: false,
      message: `Para grupos de más de ${currentMax} personas, por favor contacte directamente con el restaurante.`,
      code: 'PAX_ABOVE_MAX'
    };
  }
  
  return { valid: true };
}

/**
 * Valida formato de email
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    throw new ValidationError('El email es requerido');
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(email)) {
    throw new ValidationError('El formato del email no es válido');
  }
  
  return true;
}

/**
 * Valida formato de teléfono (básico)
 */
function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') {
    throw new ValidationError('El teléfono es requerido');
  }
  
  // Eliminar espacios y caracteres especiales
  const cleanPhone = phone.replace(/[\s\-()]/g, '');
  
  // Debe tener entre 9 y 15 dígitos
  if (!/^\+?[\d]{9,15}$/.test(cleanPhone)) {
    throw new ValidationError('El formato del teléfono no es válido');
  }
  
  return true;
}

/**
 * Valida fecha de reserva
 */
function validateBookingDate(dateStr) {
  if (!dateStr) {
    throw new ValidationError('La fecha es requerida');
  }
  
  // Validar formato YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new ValidationError('El formato de fecha debe ser YYYY-MM-DD');
  }
  
  const date = new Date(dateStr);
  
  if (isNaN(date.getTime())) {
    throw new ValidationError('La fecha no es válida');
  }
  
  if (!isDateInBookableRange(dateStr)) {
    throw new ValidationError(
      `Solo se permiten reservas hasta ${getBookingRules().maxDaysAhead} días en el futuro`
    );
  }
  
  return true;
}

/**
 * Valida hora de reserva.
 * @param {Object} options
 * @param {boolean} options.skipAdvanceCheck - BUG-14: el back-office puede
 *   editar reservas inminentes sin la antelación mínima de cliente.
 */
function validateBookingTime(dateStr, timeStr, options = {}) {
  if (!timeStr) {
    throw new ValidationError('La hora es requerida');
  }

  // Validar formato HH:mm
  if (!/^\d{2}:\d{2}$/.test(timeStr)) {
    throw new ValidationError('El formato de hora debe ser HH:mm');
  }

  const [hours, minutes] = timeStr.split(':').map(Number);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new ValidationError('La hora no es válida');
  }

  if (!options.skipAdvanceCheck && !meetsMinimumAdvanceTime(dateStr, timeStr)) {
    throw new ValidationError(
      `Debe reservar con al menos ${getBookingRules().minHoursAhead} horas de antelación`
    );
  }

  return true;
}

/**
 * Valida datos de cliente para crear reserva
 */
function validateCustomerData(data) {
  const errors = [];
  
  if (!data.firstName || data.firstName.trim().length < 2) {
    errors.push('El nombre debe tener al menos 2 caracteres');
  }
  
  try {
    validateEmail(data.email);
  } catch (e) {
    errors.push(e.message);
  }
  
  try {
    validatePhone(data.phone);
  } catch (e) {
    errors.push(e.message);
  }
  
  if (errors.length > 0) {
    throw new ValidationError('Errores de validación', errors);
  }
  
  return true;
}

/**
 * Valida datos completos de reserva
 */
async function validateBookingData(data) {
  const errors = [];
  
  // Validar fecha
  try {
    validateBookingDate(data.date);
  } catch (e) {
    errors.push(e.message);
  }
  
  // Validar hora
  try {
    validateBookingTime(data.date, data.time);
  } catch (e) {
    errors.push(e.message);
  }
  
  // Validar comensales
  const paxValidation = await validatePaxCount(data.pax);
  if (!paxValidation.valid) {
    errors.push(paxValidation.message);
  }
  
  // Validar datos de cliente
  try {
    validateCustomerData(data);
  } catch (e) {
    if (e.details && Array.isArray(e.details)) {
      errors.push(...e.details);
    } else {
      errors.push(e.message);
    }
  }
  
  if (errors.length > 0) {
    throw new ValidationError('Datos de reserva inválidos', errors);
  }
  
  return true;
}

/**
 * Sanitiza entrada de texto para prevenir inyecciones
 */
function sanitizeText(text, maxLength = 500) {
  if (!text) return '';
  
  return text
    .trim()
    .slice(0, maxLength)
    .replace(/<script[^>]*>.*?<\/script>/gi, '') // Eliminar scripts
    .replace(/<[^>]+>/g, ''); // Eliminar HTML tags
}

/**
 * Valida array de alergias
 */
function validateAllergens(allergens) {
  if (!allergens) return [];
  
  if (!Array.isArray(allergens)) {
    throw new ValidationError('Las alergias deben ser un array');
  }
  
  // Limitar a 10 alergias máximo
  if (allergens.length > 10) {
    throw new ValidationError('Máximo 10 alergias permitidas');
  }
  
  // Sanitizar cada alergia
  return allergens
    .map(a => sanitizeText(a, 50))
    .filter(a => a.length > 0);
}

module.exports = {
  validatePaxCount,
  validateEmail,
  validatePhone,
  validateBookingDate,
  validateBookingTime,
  validateCustomerData,
  validateBookingData,
  validateAllergens,
  sanitizeText
};