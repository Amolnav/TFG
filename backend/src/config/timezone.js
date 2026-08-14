// BUG-04: todo el motor de fechas (utils/dateHelpers.js) interpreta las horas
// en la zona horaria del proceso. Si TZ no está definida, las reservas se
// guardan desplazadas respecto a la hora real del restaurante.

/**
 * Comprueba la configuración de zona horaria del proceso.
 * @param {Object} env - Normalmente process.env (inyectable para tests)
 * @returns {{ok: boolean, timezone: string, warnings: string[]}}
 */
function checkTimezone(env = process.env) {
  const warnings = [];
  const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (!env.TZ) {
    warnings.push(
      `La variable de entorno TZ no está definida: el proceso usa "${systemTimezone}". ` +
      'El motor de reservas interpreta todas las horas en la TZ del proceso; ' +
      'define TZ (p. ej. TZ=Europe/Madrid) para que coincida con la del restaurante.'
    );
  }

  return {
    ok: warnings.length === 0,
    timezone: env.TZ || systemTimezone,
    warnings
  };
}

module.exports = { checkTimezone };
