/**
 * Reglas de negocio de reservas (plan de modularidad M4).
 *
 * Viven en SystemConfig (editables por despliegue) pero los helpers de fechas
 * y duraciones las necesitan de forma síncrona, así que se mantienen en una
 * caché en memoria:
 *   - loadBookingRules(): lee SystemConfig y refresca la caché (arranque y
 *     tras cada PATCH /backoffice/config).
 *   - getBookingRules(): acceso síncrono; devuelve los defaults neutros del
 *     configSchema mientras no se haya cargado nada.
 *   - primeBookingRules()/resetBookingRules(): para tests.
 */

const { CONFIG_DEFAULTS } = require('./configSchema');

// Tramos ordenados: los acotados primero (asc), el tramo "resto" al final
function sortDurations(durations) {
  return [...durations].sort((a, b) => {
    if (a.maxPax === null) return 1;
    if (b.maxPax === null) return -1;
    return a.maxPax - b.maxPax;
  });
}

function parseRules(configMap) {
  const value = (key) => configMap[key] ?? CONFIG_DEFAULTS[key];

  let durations;
  try {
    durations = JSON.parse(value('booking_durations'));
  } catch {
    durations = JSON.parse(CONFIG_DEFAULTS.booking_durations);
  }

  return {
    durations: sortDurations(durations),
    minHoursAhead: parseInt(value('booking_min_hours_ahead'), 10),
    maxDaysAhead: parseInt(value('booking_max_days_ahead'), 10),
    suggestionOffsets: String(value('booking_suggestion_offsets')).split(',').map(Number),
    maxSuggestions: parseInt(value('booking_max_suggestions'), 10),
    noShowThreshold: parseInt(value('no_show_threshold'), 10),
    paxMin: parseInt(value('pax_min'), 10)
  };
}

const DEFAULT_RULES = parseRules({});

let cachedRules = DEFAULT_RULES;

function getBookingRules() {
  return cachedRules;
}

async function loadBookingRules() {
  // require perezoso para no crear el cliente Prisma al importar este módulo
  // desde tests unitarios que no tocan BD
  const prisma = require('./database');
  const keys = [
    'booking_durations',
    'booking_min_hours_ahead',
    'booking_max_days_ahead',
    'booking_suggestion_offsets',
    'booking_max_suggestions',
    'no_show_threshold',
    'pax_min'
  ];
  const rows = await prisma.systemConfig.findMany({ where: { key: { in: keys } } });
  const configMap = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  cachedRules = parseRules(configMap);
  return cachedRules;
}

/** Solo para tests: fija reglas sin tocar BD. */
function primeBookingRules(partial) {
  cachedRules = { ...DEFAULT_RULES, ...partial };
  if (partial.durations) {
    cachedRules.durations = sortDurations(partial.durations);
  }
  return cachedRules;
}

/** Solo para tests: vuelve a los defaults neutros. */
function resetBookingRules() {
  cachedRules = DEFAULT_RULES;
}

module.exports = {
  getBookingRules,
  loadBookingRules,
  primeBookingRules,
  resetBookingRules,
  DEFAULT_RULES
};
