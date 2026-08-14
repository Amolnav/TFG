import { describe, it, expect, afterEach } from 'vitest';
const {
  getBookingRules,
  primeBookingRules,
  resetBookingRules,
  DEFAULT_RULES
} = require('../../config/bookingRules');
const { calculateDuration } = require('../../utils/tableHelpers');

// M4: las reglas de negocio (duraciones por pax, antelaciones, sugerencias)
// salen de SystemConfig con caché síncrona y defaults neutros.
describe('bookingRules (M4)', () => {
  afterEach(() => {
    resetBookingRules();
  });

  it('sin BD devuelve los defaults neutros del configSchema', () => {
    const rules = getBookingRules();
    expect(rules.maxDaysAhead).toBe(30);
    expect(rules.minHoursAhead).toBe(2);
    expect(rules.paxMin).toBe(1);
    expect(rules.noShowThreshold).toBe(3);
    expect(rules.suggestionOffsets).toEqual([-30, 30, -60, 60]);
  });

  it('calculateDuration usa los tramos por defecto', () => {
    expect(calculateDuration(1)).toBe(90);
    expect(calculateDuration(2)).toBe(90);
    expect(calculateDuration(3)).toBe(120);
    expect(calculateDuration(5)).toBe(150);
    expect(calculateDuration(9)).toBe(180);
  });

  it('calculateDuration respeta tramos personalizados (bar de tapas: 60 min planos)', () => {
    primeBookingRules({ durations: [{ maxPax: null, minutes: 60 }] });
    expect(calculateDuration(2)).toBe(60);
    expect(calculateDuration(10)).toBe(60);
  });

  it('los tramos se ordenan y el comodín (maxPax null) va al final', () => {
    primeBookingRules({
      durations: [
        { maxPax: null, minutes: 200 },
        { maxPax: 4, minutes: 100 },
        { maxPax: 2, minutes: 50 }
      ]
    });
    expect(calculateDuration(2)).toBe(50);
    expect(calculateDuration(4)).toBe(100);
    expect(calculateDuration(12)).toBe(200);
  });

  it('primeBookingRules solo pisa lo indicado y reset vuelve a los defaults', () => {
    primeBookingRules({ minHoursAhead: 1 });
    expect(getBookingRules().minHoursAhead).toBe(1);
    expect(getBookingRules().maxDaysAhead).toBe(DEFAULT_RULES.maxDaysAhead);
    resetBookingRules();
    expect(getBookingRules().minHoursAhead).toBe(2);
  });
});
