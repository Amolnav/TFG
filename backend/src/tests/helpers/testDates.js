// Fechas deterministas para los tests.
// El reloj se congela en setup.js a FROZEN_NOW (solo Date, no timers),
// y los tests derivan sus fechas de aquí en vez de hardcodearlas,
// para que la suite no caduque con el paso del calendario.

const FROZEN_NOW = new Date('2026-04-15T10:00:00');

function formatDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * "YYYY-MM-DD" a N días del reloj congelado (N puede ser negativo).
 */
function daysFromFrozenNow(days) {
  const d = new Date(FROZEN_NOW);
  d.setDate(d.getDate() + days);
  return formatDateLocal(d);
}

module.exports = {
  FROZEN_NOW,
  daysFromFrozenNow,
  formatDateLocal
};
