
const prisma = require('../config/database');
const {
  combineDateAndTime,
  addMinutes,
  doTimeRangesOverlap,
  getDayOfWeek,
  isDateInBookableRange,
  meetsMinimumAdvanceTime,
  generateTimeSlots,
  getDaysInMonth,
  formatDate
} = require('../utils/dateHelpers');
const { calculateDuration } = require('../utils/tableHelpers');
const { BOOKING_STATUS } = require('../config/constants');
const { getBookingRules } = require('../config/bookingRules');
const { BusinessError } = require('../middleware/errorHandler');

function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function getDateContext(dateStr) {
  return {
    date: combineDateAndTime(dateStr, '12:00'),
    dayStart: combineDateAndTime(dateStr, '00:00'),
    dayEnd: combineDateAndTime(dateStr, '23:59')
  };
}

/**
 * BUG-11: semántica unificada de cierres.
 * - endDate definido → el cierre cubre el rango [startDate, endDate].
 * - endDate null → cierre de UN solo día: el de startDate.
 * (Antes la disponibilidad trataba endDate null como "cerrado indefinidamente".)
 */
function closureAppliesToDay(closure, dayStart, dayEnd) {
  if (closure.endDate) {
    return closure.startDate <= dayEnd && closure.endDate >= dayStart;
  }
  return closure.startDate >= dayStart && closure.startDate <= dayEnd;
}

async function getClosuresForDate(dateStr) {
  const { dayStart, dayEnd } = getDateContext(dateStr);

  const closures = await prisma.closure.findMany({
    where: {
      startDate: { lte: dayEnd },
      OR: [
        { endDate: { gte: dayStart } },
        { endDate: null, startDate: { gte: dayStart } }
      ]
    }
  });

  // Filtro defensivo en JS con la misma semántica que el where
  return closures.filter((closure) => closureAppliesToDay(closure, dayStart, dayEnd));
}

function isShiftBlockedByClosure(shift, closures) {
  return closures.some((closure) =>
    closure.shiftId === shift.id || (closure.isFullDay && !closure.shiftId)
  );
}

// M4: los días de apertura se derivan de los turnos reales (Shift.daysOfWeek);
// la clave de configuración opening_days se ha eliminado como fuente duplicada.
async function getActiveShiftsForDate(dateStr) {
  const { date } = getDateContext(dateStr);
  const dayOfWeek = getDayOfWeek(date);

  const [shifts, closures] = await Promise.all([
    prisma.shift.findMany({
      where: {
        isActive: true,
        daysOfWeek: { has: dayOfWeek }
      },
      orderBy: { startTime: 'asc' }
    }),
    getClosuresForDate(dateStr)
  ]);

  if (shifts.length === 0) {
    return {
      shifts: [],
      code: 'CLOSED_DAY',
      message: 'El restaurante está cerrado este día'
    };
  }

  const availableShifts = shifts.filter((shift) => !isShiftBlockedByClosure(shift, closures));

  if (availableShifts.length === 0) {
    return {
      shifts: [],
      code: 'CLOSED_DAY',
      message: 'El restaurante está cerrado este día'
    };
  }

  return { shifts: availableShifts, code: null, message: null };
}

function findMatchingShift(timeStr, pax, shifts) {
  const requestedMinutes = timeToMinutes(timeStr);
  const duration = calculateDuration(pax);

  for (const shift of shifts) {
    const startMinutes = timeToMinutes(shift.startTime);
    const endMinutes = timeToMinutes(shift.endTime);

    if (requestedMinutes < startMinutes || requestedMinutes >= endMinutes) {
      continue;
    }

    if ((requestedMinutes - startMinutes) % shift.slotInterval !== 0) {
      continue;
    }

    if (requestedMinutes + duration > endMinutes) {
      continue;
    }

    return shift;
  }

  return null;
}

/**
 * @param {Object} options
 * @param {boolean} options.skipAdvanceCheck - BUG-14: el back-office puede
 *   operar sobre reservas inminentes; la antelación mínima es una regla
 *   para el cliente público, no para el staff.
 * @param {Object} options.db - cliente Prisma/transacción para las
 *   comprobaciones con BD (límite de cocina por slot).
 */
async function validateBookableSlot(dateStr, timeStr, pax, options = {}) {
  if (!isDateInBookableRange(dateStr)) {
    return {
      valid: false,
      code: 'DATE_OUT_OF_RANGE',
      message: 'La fecha está fuera del rango permitido para reservas'
    };
  }

  if (!options.skipAdvanceCheck && !meetsMinimumAdvanceTime(dateStr, timeStr)) {
    return {
      valid: false,
      code: 'MIN_ADVANCE_NOT_MET',
      message: `Debe reservar con al menos ${getBookingRules().minHoursAhead} horas de antelación`
    };
  }

  const { shifts, code, message } = await getActiveShiftsForDate(dateStr);
  if (shifts.length === 0) {
    return { valid: false, code, message };
  }

  const shift = findMatchingShift(timeStr, pax, shifts);
  if (!shift) {
    return {
      valid: false,
      code: 'TIME_NOT_IN_SHIFT',
      message: 'La hora seleccionada no pertenece a un turno disponible'
    };
  }

  // M4: Shift.maxBookingsPerSlot limita cuántas reservas pueden EMPEZAR en el
  // mismo slot (límite de cocina), independientemente de las mesas libres.
  // options.excludeBookingId evita que una edición cuente su propia reserva.
  if (shift.maxBookingsPerSlot) {
    const db = options.db || prisma;
    const slotStart = combineDateAndTime(dateStr, timeStr);
    const slotBookings = await db.booking.count({
      where: {
        date: slotStart,
        ...ACTIVE_BOOKING_FILTER,
        ...(options.excludeBookingId ? { id: { not: options.excludeBookingId } } : {})
      }
    });
    if (slotBookings >= shift.maxBookingsPerSlot) {
      return {
        valid: false,
        code: 'SLOT_FULL',
        message: 'Ese horario ya ha alcanzado el máximo de reservas admitidas'
      };
    }
  }

  return { valid: true, shift };
}

async function assertBookableSlot(dateStr, timeStr, pax, options = {}) {
  const result = await validateBookableSlot(dateStr, timeStr, pax, options);

  if (!result.valid) {
    throw new BusinessError(result.message, result.code || 'INVALID_BOOKING_SLOT', 409);
  }

  return result.shift;
}

/**
 * Obtiene los días disponibles en un mes para un número de comensales.
 * BUG-22: turnos, cierres y reservas del mes se cargan UNA vez y todo el
 * cálculo por día/slot se hace en memoria (antes: miles de queries).
 * @param {number} year
 * @param {number} month - 1-12
 * @param {number} pax
 * @param {number?} zoneId - Opcional
 * @returns {Promise<string[]>} Array de fechas "YYYY-MM-DD"
 */
async function getAvailableDaysInMonth(year, month, pax, zoneId = null) {
  const allDays = getDaysInMonth(year, month).filter(isDateInBookableRange);
  if (allDays.length === 0) return [];

  const tables = await getCandidateTables(pax, zoneId);
  if (tables.length === 0) return [];

  const allShifts = await prisma.shift.findMany({
    where: { isActive: true },
    orderBy: { startTime: 'asc' }
  });
  if (allShifts.length === 0) return [];

  const rangeStart = combineDateAndTime(allDays[0], '00:00');
  const rangeEnd = combineDateAndTime(allDays[allDays.length - 1], '23:59');

  const closures = await prisma.closure.findMany({
    where: { startDate: { lte: rangeEnd } }
  });

  const bookings = await getBookingsForRange(tables.map((t) => t.id), rangeStart, rangeEnd);

  // M4: si algún turno limita reservas por slot, se cargan los contadores de
  // slots de todo el rango en una única query
  const slotCounts = allShifts.some((shift) => shift.maxBookingsPerSlot)
    ? await getSlotCounts(rangeStart, rangeEnd)
    : null;

  const availableDays = [];

  for (const dateStr of allDays) {
    const { date, dayStart, dayEnd } = getDateContext(dateStr);
    const dayOfWeek = getDayOfWeek(date);

    const dayClosures = closures.filter((closure) => closureAppliesToDay(closure, dayStart, dayEnd));
    const dayShifts = allShifts
      .filter((shift) => shift.daysOfWeek.includes(dayOfWeek))
      .filter((shift) => !isShiftBlockedByClosure(shift, dayClosures));

    if (dayShifts.length === 0) continue;

    if (hasFreeSlotInMemory(dayShifts, tables, dateStr, pax, bookings, slotCounts)) {
      availableDays.push(dateStr);
    }
  }

  return availableDays;
}

/**
 * M4: contadores de reservas activas agrupadas por instante de inicio, para
 * aplicar Shift.maxBookingsPerSlot sin una query por slot.
 */
async function getSlotCounts(rangeStart, rangeEnd) {
  const grouped = await prisma.booking.groupBy({
    by: ['date'],
    where: {
      ...ACTIVE_BOOKING_FILTER,
      date: { gte: rangeStart, lte: rangeEnd }
    },
    _count: { _all: true }
  });

  return new Map(grouped.map((group) => [new Date(group.date).getTime(), group._count._all]));
}

/**
 * true si el slot admite otra reserva según Shift.maxBookingsPerSlot.
 */
function slotHasKitchenCapacity(shift, dateStr, timeStr, slotCounts) {
  if (!shift.maxBookingsPerSlot || !slotCounts) return true;
  const slotStart = combineDateAndTime(dateStr, timeStr).getTime();
  return (slotCounts.get(slotStart) || 0) < shift.maxBookingsPerSlot;
}

/**
 * Comprueba en memoria si algún slot de los turnos dados tiene mesa libre.
 */
function hasFreeSlotInMemory(shifts, tables, dateStr, pax, bookings, slotCounts = null) {
  const duration = calculateDuration(pax);

  for (const shift of shifts) {
    const timeSlots = generateTimeSlots(shift.startTime, shift.endTime, shift.slotInterval)
      .filter((time) => timeToMinutes(time) + duration <= timeToMinutes(shift.endTime));

    for (const time of timeSlots) {
      if (!slotHasKitchenCapacity(shift, dateStr, time, slotCounts)) continue;
      if (findFreeTablesInMemory(tables, dateStr, time, pax, bookings).length > 0) {
        return true;
      }
    }
  }

  return false;
}


/**
 * Obtiene las horas disponibles para un día específico
 * @param {string} dateStr - "YYYY-MM-DD"
 * @param {number} pax
 * @param {number?} zoneId
 * @returns {Promise<Object>} { times: [...], shifts: [...] }
 */
async function getAvailableTimesForDay(dateStr, pax, zoneId = null) {
  // Validar fecha
  if (!isDateInBookableRange(dateStr)) {
    return { times: [], shifts: [], code: 'DATE_OUT_OF_RANGE', message: 'Fecha fuera del rango permitido' };
  }

  const { shifts, code: shiftsCode, message: shiftsMessage } = await getActiveShiftsForDate(dateStr);
  if (shifts.length === 0) {
    return { times: [], shifts: [], code: shiftsCode, message: shiftsMessage };
  }

  // Obtener mesas candidatas
  const tables = await getCandidateTables(pax, zoneId);
  if (tables.length === 0) {
    return { times: [], shifts: [], code: 'NO_TABLES_FOR_PAX', message: 'No hay mesas disponibles con esa capacidad' };
  }

  // BUG-22: una sola carga de reservas para todo el día
  const bookings = await getBookingsForDate(tables.map((t) => t.id), dateStr);

  // M4: límite de cocina por slot
  const { dayStart, dayEnd } = getDateContext(dateStr);
  const slotCounts = shifts.some((shift) => shift.maxBookingsPerSlot)
    ? await getSlotCounts(dayStart, dayEnd)
    : null;

  const availableTimes = [];
  const shiftInfo = [];
  const duration = calculateDuration(pax);

  for (const shift of shifts) {
    const timeSlots = generateTimeSlots(shift.startTime, shift.endTime, shift.slotInterval)
      .filter((time) => timeToMinutes(time) + duration <= timeToMinutes(shift.endTime));
    const shiftAvailableTimes = [];

    for (const time of timeSlots) {
      // Comprobar antelación mínima
      if (!meetsMinimumAdvanceTime(dateStr, time)) continue;

      // Límite de reservas por slot (M4)
      if (!slotHasKitchenCapacity(shift, dateStr, time, slotCounts)) continue;

      // Buscar mesas libres (en memoria)
      const freeTables = findFreeTablesInMemory(tables, dateStr, time, pax, bookings);

      if (freeTables.length > 0) {
        shiftAvailableTimes.push(time);
        availableTimes.push(time);
      }
    }

    if (shiftAvailableTimes.length > 0) {
      shiftInfo.push({
        name: shift.name,
        times: shiftAvailableTimes
      });
    }
  }
  
  return {
    times: availableTimes,
    shifts: shiftInfo,
    code: availableTimes.length > 0 ? null : 'NO_AVAILABILITY',
    message: availableTimes.length > 0 ? null : 'No hay disponibilidad para este día'
  };
}

/**
 * Comprueba disponibilidad en una hora específica y sugiere alternativas
 * @param {string} dateStr
 * @param {string} timeStr
 * @param {number} pax
 * @param {number?} zoneId
 * @returns {Promise<Object>}
 */
async function checkAvailability(dateStr, timeStr, pax, zoneId = null) {
  const slotValidation = await validateBookableSlot(dateStr, timeStr, pax);
  if (!slotValidation.valid) {
    return {
      available: false,
      code: slotValidation.code,
      message: slotValidation.message,
      suggestions: []
    };
  }

  // Obtener mesas candidatas
  const tables = await getCandidateTables(pax, zoneId);
  if (tables.length === 0) {
    return {
      available: false,
      code: 'NO_TABLES_FOR_PAX',
      message: 'No existen mesas con esa capacidad en esta zona',
      suggestions: []
    };
  }

  // BUG-22: una sola carga de reservas compartida entre la hora solicitada
  // y las sugerencias
  const bookings = await getBookingsForDate(tables.map((t) => t.id), dateStr);

  // Comprobar hora solicitada
  const freeTables = findFreeTablesInMemory(tables, dateStr, timeStr, pax, bookings);

  if (freeTables.length > 0) {
    return {
      available: true,
      time: timeStr,
      tables: freeTables.map(t => ({
        id: t.id,
        name: t.name,
        capacity: `${t.minCapacity}-${t.maxCapacity}`,
        zone: t.zone?.name
      }))
    };
  }

  // Si no hay disponibilidad, buscar sugerencias
  const suggestions = await findAlternativeTimes(tables, dateStr, timeStr, pax, bookings);

  return {
    available: false,
    code: 'FULLY_BOOKED',
    message: 'Lo sentimos, a esa hora estamos completos',
    requestedTime: timeStr,
    suggestions
  };
}

/**
 * Obtiene mesas candidatas por capacidad y zona
 */
async function getCandidateTables(pax, zoneId = null) {
  const whereClause = {
    isActive: true,
    minCapacity: { lte: pax },
    maxCapacity: { gte: pax }
  };
  
  if (zoneId) {
    whereClause.zoneId = parseInt(zoneId);
  }
  
  return await prisma.table.findMany({
    where: whereClause,
    include: { zone: true }
  });
}

// BUG-22: margen hacia atrás al cargar reservas de un rango — una reserva
// que empieza antes del rango puede seguir ocupando mesa dentro de él
// (la duración máxima es DURATION.GROUP = 180 min).
const BOOKING_LOOKBEHIND_MINUTES = 240;

const ACTIVE_BOOKING_FILTER = {
  status: {
    notIn: [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.NO_SHOW]
  }
};

/**
 * BUG-22: carga en UNA query todas las reservas activas de un conjunto de
 * mesas en un rango de fechas; las comprobaciones de solape se hacen después
 * en memoria (antes se consultaba la BD por slot × mesa).
 */
async function getBookingsForRange(tableIds, rangeStart, rangeEnd) {
  if (tableIds.length === 0) return [];

  return prisma.booking.findMany({
    where: {
      tableId: { in: tableIds },
      ...ACTIVE_BOOKING_FILTER,
      date: {
        gte: addMinutes(rangeStart, -BOOKING_LOOKBEHIND_MINUTES),
        lte: rangeEnd
      }
    }
  });
}

function getBookingsForDate(tableIds, dateStr) {
  const { dayStart, dayEnd } = getDateContext(dateStr);
  return getBookingsForRange(tableIds, dayStart, dayEnd);
}

/**
 * Comprobación de solape en memoria sobre reservas ya cargadas.
 */
function isTableFreeInMemory(tableId, startTime, endTime, bookings) {
  return !bookings.some((booking) => {
    if (booking.tableId !== tableId) return false;
    const bookingStart = new Date(booking.date);
    const bookingEnd = addMinutes(bookingStart, booking.duration);
    return doTimeRangesOverlap(startTime, endTime, bookingStart, bookingEnd);
  });
}

function findFreeTablesInMemory(tables, dateStr, timeStr, pax, bookings) {
  const duration = calculateDuration(pax);
  const startDateTime = combineDateAndTime(dateStr, timeStr);
  const endDateTime = addMinutes(startDateTime, duration);
  return tables.filter((table) => isTableFreeInMemory(table.id, startDateTime, endDateTime, bookings));
}

/**
 * Encuentra mesas libres en un momento específico (carga las reservas del
 * día y delega en la comprobación en memoria).
 */
async function findFreeTablesAtTime(tables, dateStr, timeStr, pax) {
  const bookings = await getBookingsForDate(tables.map((t) => t.id), dateStr);
  return findFreeTablesInMemory(tables, dateStr, timeStr, pax, bookings);
}

/**
 * Comprueba si una mesa está libre en un rango de tiempo
 */
async function isTableFreeAtTime(tableId, startTime, endTime) {
  const bookings = await getBookingsForRange([tableId], startTime, endTime);
  return isTableFreeInMemory(tableId, startTime, endTime, bookings);
}

/**
 * Busca horarios alternativos cercanos.
 * BUG-08: solo se sugieren horas que serían realmente reservables:
 * dentro de un turno activo, alineadas al slot, con la duración cabiendo
 * antes del cierre, y sin cambiar de día.
 */
async function findAlternativeTimes(tables, dateStr, requestedTime, pax, bookings) {
  const suggestions = [];
  const { suggestionOffsets: offsets, maxSuggestions } = getBookingRules();
  const { shifts } = await getActiveShiftsForDate(dateStr);

  if (shifts.length === 0) return suggestions;

  for (const offset of offsets) {
    const baseDate = combineDateAndTime(dateStr, requestedTime);
    const newDateTime = addMinutes(baseDate, offset);
    const newTimeStr = newDateTime.toTimeString().slice(0, 5);

    // El offset no puede cambiar de día (p. ej. cerca de medianoche)
    if (formatDate(newDateTime) !== dateStr) continue;

    // La hora sugerida debe pertenecer a un turno y caber antes del cierre
    if (!findMatchingShift(newTimeStr, pax, shifts)) continue;

    // Comprobar antelación mínima
    if (!meetsMinimumAdvanceTime(dateStr, newTimeStr)) continue;

    // Buscar mesas libres (en memoria, sobre las reservas ya cargadas)
    const freeTables = findFreeTablesInMemory(tables, dateStr, newTimeStr, pax, bookings);

    if (freeTables.length > 0) {
      suggestions.push({
        time: newTimeStr,
        availableTables: freeTables.length,
        difference: offset > 0 ? `+${offset} min` : `${offset} min`
      });

      // Limitar sugerencias
      if (suggestions.length >= maxSuggestions) break;
    }
  }

  return suggestions.sort((a, b) => a.time.localeCompare(b.time));
}

module.exports = {
  getAvailableDaysInMonth,
  getAvailableTimesForDay,
  checkAvailability,
  isTableFreeAtTime,
  getCandidateTables,
  findFreeTablesAtTime,
  validateBookableSlot,
  assertBookableSlot
};
