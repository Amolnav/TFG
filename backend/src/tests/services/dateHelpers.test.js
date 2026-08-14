import { describe, it, expect } from 'vitest';
const { daysFromFrozenNow } = require('../helpers/testDates');
const { isDateInBookableRange } = require('../../utils/dateHelpers');
// M4: la ventana de reserva sale de las reglas configurables (defaults neutros)
const { getBookingRules } = require('../../config/bookingRules');
const AVAILABILITY = { MAX_DAYS_AHEAD: getBookingRules().maxDaysAhead };

// BUG-07: isDateInBookableRange mezclaba parseo UTC ("YYYY-MM-DD") con
// aritmética local, rechazando siempre el día +MAX_DAYS_AHEAD.
describe('dateHelpers.isDateInBookableRange (BUG-07)', () => {
  it('acepta hoy', () => {
    expect(isDateInBookableRange(daysFromFrozenNow(0))).toBe(true);
  });

  it('rechaza ayer', () => {
    expect(isDateInBookableRange(daysFromFrozenNow(-1))).toBe(false);
  });

  it(`acepta el día límite (+${AVAILABILITY.MAX_DAYS_AHEAD})`, () => {
    expect(isDateInBookableRange(daysFromFrozenNow(AVAILABILITY.MAX_DAYS_AHEAD))).toBe(true);
  });

  it(`rechaza el día +${AVAILABILITY.MAX_DAYS_AHEAD + 1}`, () => {
    expect(isDateInBookableRange(daysFromFrozenNow(AVAILABILITY.MAX_DAYS_AHEAD + 1))).toBe(false);
  });

  it('rechaza fechas con formato inválido', () => {
    expect(isDateInBookableRange('no-es-fecha')).toBe(false);
  });
});
