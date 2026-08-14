const prisma = require('../config/database');
const { CONFIG_SCHEMA, CONFIG_DEFAULTS } = require('../config/configSchema');
const { logger } = require('../config/logger');

// Caché en memoria de SystemConfig (plan de modularidad M4): el payload
// público se sirve en cada visita y los emails leen identidad en cada envío.
// invalidateConfigCache() se llama tras cada escritura de configuración.
const CACHE_TTL_MS = 30 * 1000;
let configCache = { map: null, timestamp: 0 };

async function getConfigMap() {
  if (configCache.map && Date.now() - configCache.timestamp < CACHE_TTL_MS) {
    return configCache.map;
  }
  const configs = await prisma.systemConfig.findMany();
  const map = {};
  configs.forEach((c) => { map[c.key] = c.value; });
  configCache = { map, timestamp: Date.now() };
  return map;
}

function invalidateConfigCache() {
  configCache = { map: null, timestamp: 0 };
}

/**
 * Valor efectivo de una clave del schema: BD si existe, default neutro si no.
 * BUG-32: se usa ?? y no || — un valor vaciado a propósito ('') no debe
 * revertir en silencio al default.
 */
async function getConfigValue(key) {
  const map = await getConfigMap();
  return map[key] ?? CONFIG_DEFAULTS[key];
}

async function getConfigValues(keys) {
  const map = await getConfigMap();
  return Object.fromEntries(keys.map((key) => [key, map[key] ?? CONFIG_DEFAULTS[key]]));
}

/**
 * Obtiene la configuración combinando la base de datos con métricas calculadas
 */
async function getFullConfig() {
  const configs = await prisma.systemConfig.findMany();

  const configMap = {};
  configs.forEach(c => configMap[c.key] = c.value);

  // Calcular métricas dinámicas basadas en las mesas
  const activeTables = await prisma.table.findMany({
    where: { isActive: true }
  });

  const totalCapacity = activeTables.reduce((sum, table) => sum + table.maxCapacity, 0);
  const maxPaxInSingleTable = activeTables.reduce((max, table) => Math.max(max, table.maxCapacity), 0);
  const activeTablesCount = activeTables.length;

  // Añadir al configMap como valores dinámicos
  configMap.dynamic_max_capacity = String(totalCapacity);
  configMap.dynamic_max_pax = String(maxPaxInSingleTable);
  configMap.dynamic_active_tables = String(activeTablesCount);

  return configMap;
}

/**
 * Obtiene el número máximo de comensales permitido en una sola mesa
 */
async function getMaxPax() {
  const maxTable = await prisma.table.findFirst({
    where: { isActive: true },
    orderBy: { maxCapacity: 'desc' }
  });

  return maxTable ? maxTable.maxCapacity : 12; // Valor por defecto si no hay mesas
}

/**
 * Horario público derivado de los turnos REALES (M1): los días y horas que ve
 * el visitante salen de la tabla Shift, nunca de textos hardcodeados.
 */
async function getPublicSchedule() {
  const shifts = await prisma.shift.findMany({
    where: { isActive: true },
    orderBy: { startTime: 'asc' },
    select: { name: true, startTime: true, endTime: true, daysOfWeek: true }
  });

  const openingDays = [...new Set(shifts.flatMap((shift) => shift.daysOfWeek))].sort((a, b) => a - b);

  return { openingDays, shifts };
}

/**
 * Payload de GET /api/public/config: todas las claves públicas del schema
 * (las JSON parseadas bajo su alias publicAs) + horario derivado de turnos.
 */
async function getPublicFrontendConfig() {
  const map = await getConfigMap();
  const result = {};

  for (const [key, entry] of Object.entries(CONFIG_SCHEMA)) {
    const raw = map[key] ?? entry.default;
    if (entry.publicAs) {
      try {
        result[entry.publicAs] = JSON.parse(raw);
      } catch (error) {
        logger.error(`Error parsing config key ${key}`, error);
        result[entry.publicAs] = JSON.parse(entry.default);
      }
    } else if (entry.public) {
      result[key] = raw;
    }
  }

  result.schedule = await getPublicSchedule();

  // N3.2: zonas activas para el selector opcional del wizard
  result.zones = await prisma.zone.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: 'asc' },
    select: { id: true, name: true, description: true }
  });

  return result;
}

module.exports = {
  getFullConfig,
  getMaxPax,
  getConfigValue,
  getConfigValues,
  getPublicSchedule,
  getPublicFrontendConfig,
  invalidateConfigCache
};
