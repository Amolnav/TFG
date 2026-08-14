const prisma = require('../../config/database');
const { asyncHandler, ValidationError } = require('../../middleware/errorHandler');
const configService = require('../../services/configService');
const { loadBookingRules } = require('../../config/bookingRules');
const { CONFIG_SCHEMA } = require('../../config/configSchema');

// Claves calculadas: se ignoran en silencio si el cliente las reenvía
const DYNAMIC_KEYS = ['dynamic_max_capacity', 'dynamic_max_pax', 'dynamic_active_tables'];

exports.getConfig = asyncHandler(async (req, res) => {
  const configMap = await configService.getFullConfig();

  res.json({
    status: 'success',
    data: configMap
  });
});

// BUG-05 + M1: whitelist y validación por clave desde configSchema (fuente
// única). Los valores llegan como string; las claves JSON se validan en forma.
exports.updateConfig = asyncHandler(async (req, res) => {
  const updates = req.body;

  const keys = Object.keys(updates).filter((key) => !DYNAMIC_KEYS.includes(key));
  if (keys.length === 0) {
    return res.json({ status: 'success', data: {} });
  }

  const errors = [];
  for (const key of keys) {
    const entry = CONFIG_SCHEMA[key];
    if (!entry) {
      errors.push(`Clave de configuración no permitida: "${key}"`);
      continue;
    }
    if (!entry.validate(String(updates[key]))) {
      errors.push(`Valor inválido para "${key}": ${entry.hint}`);
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Configuración inválida', errors);
  }

  for (const key of keys) {
    await prisma.systemConfig.upsert({
      where: { key },
      update: { value: String(updates[key]) },
      create: { key, value: String(updates[key]) }
    });
  }

  // La caché de config y las reglas de negocio se refrescan en la misma
  // petición: el siguiente cálculo de disponibilidad ya usa los valores nuevos
  configService.invalidateConfigCache();
  await loadBookingRules();

  const configMap = await configService.getFullConfig();

  res.json({
    status: 'success',
    message: 'Configuraciones actualizadas',
    data: configMap
  });
});
