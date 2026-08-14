
const { getBookingRules } = require('../config/bookingRules');

/**
 * Formatea una fecha a YYYY-MM-DD (en hora local del sistema)
 */
function formatDate(date) {
  if (!(date instanceof Date)) date = new Date(date);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formatea una hora a HH:mm (en hora local del sistema)
 */
function formatTime(date) {
  if (!(date instanceof Date)) date = new Date(date);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Combina fecha y hora en un DateTime.
 * IMPORTANTE: El servidor debe tener TZ=Europe/Madrid configurado
 * para que esto se interprete correctamente como la hora local de España.
 * @param {string} dateStr - "2025-02-10"
 * @param {string} timeStr - "14:30"
 * @returns {Date}
 */
function combineDateAndTime(dateStr, timeStr) {
  // Al no especificar Z ni offset, JS lo interpreta como hora local del sistema (node process)
  return new Date(`${dateStr}T${timeStr}:00`);
}

/**
 * Añade minutos a una fecha
 */
function addMinutes(date, minutes) {
  if (!(date instanceof Date)) date = new Date(date);
  return new Date(date.getTime() + minutes * 60000);
}

/**
 * Añade días a una fecha
 */
function addDays(date, days) {
  if (!(date instanceof Date)) date = new Date(date);
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Comprueba si dos rangos de tiempo se solapan
 * @param {Date} start1
 * @param {Date} end1
 * @param {Date} start2
 * @param {Date} end2
 */
function doTimeRangesOverlap(start1, end1, start2, end2) {
  return start1 < end2 && start2 < end1;
}

/**
 * Obtiene el día de la semana (0=Domingo, 6=Sábado)
 */
function getDayOfWeek(date) {
  if (!(date instanceof Date)) date = new Date(date);
  return date.getDay();
}

/**
 * Parsea "YYYY-MM-DD" como fecha LOCAL (medianoche local), devolviendo null
 * si el formato o los componentes no son válidos.
 * BUG-07: `new Date("YYYY-MM-DD")` parsea en UTC, lo que mezclado con la
 * aritmética local rechazaba siempre el día +MAX_DAYS_AHEAD.
 */
function parseLocalDate(dateStr) {
  if (dateStr instanceof Date) {
    if (isNaN(dateStr.getTime())) return null;
    return new Date(dateStr.getFullYear(), dateStr.getMonth(), dateStr.getDate());
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  // Rechazar componentes que "ruedan" (p. ej. 2026-02-31 → 3 de marzo)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

/**
 * Comprueba si una fecha está dentro del rango permitido
 */
function isDateInBookableRange(date) {
  const targetDate = parseLocalDate(date);
  if (!targetDate) return false;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // No puede ser en el pasado (permitimos hoy)
  if (targetDate < today) return false;

  // No puede ser más allá del máximo permitido (el día límite es reservable)
  const maxDate = addDays(today, getBookingRules().maxDaysAhead);
  if (targetDate > maxDate) return false;

  return true;
}

/**
 * Comprueba si una fecha/hora cumple el mínimo de antelación
 */
function meetsMinimumAdvanceTime(dateStr, timeStr) {
  const bookingDateTime = combineDateAndTime(dateStr, timeStr);
  const now = new Date();
  const minDateTime = addMinutes(now, getBookingRules().minHoursAhead * 60);
  
  return bookingDateTime >= minDateTime;
}

/**
 * Genera horarios dentro de un turno
 * @param {string} startTime - "13:00"
 * @param {string} endTime - "16:00"
 * @param {number} interval - Minutos entre slots (ej: 30)
 * @returns {string[]} - ["13:00", "13:30", "14:00", ...]
 */
function generateTimeSlots(startTime, endTime, interval = 30) {
  const slots = [];
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  
  let currentMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  
  while (currentMinutes <= endMinutes) {
    const hours = Math.floor(currentMinutes / 60);
    const minutes = currentMinutes % 60;
    slots.push(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
    currentMinutes += interval;
  }
  
  return slots;
}

/**
 * Obtiene todos los días de un mes
 * @param {number} year
 * @param {number} month - 1-12
 * @returns {string[]} - ["2025-02-01", "2025-02-02", ...]
 */
function getDaysInMonth(year, month) {
  const days = [];
  const date = new Date(year, month - 1, 1);
  
  while (date.getMonth() === month - 1) {
    days.push(formatDate(new Date(date)));
    date.setDate(date.getDate() + 1);
  }
  
  return days;
}

module.exports = {
  formatDate,
  formatTime,
  parseLocalDate,
  combineDateAndTime,
  addMinutes,
  addDays,
  doTimeRangesOverlap,
  getDayOfWeek,
  isDateInBookableRange,
  meetsMinimumAdvanceTime,
  generateTimeSlots,
  getDaysInMonth
};
