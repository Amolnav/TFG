import { describe, it, expect } from 'vitest';
import { pickLocalized, formatOpeningDays, formatPrice, getBaseLanguage } from '../../utils/i18n';

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

describe('pickLocalized (M2/M5)', () => {
  it('resuelve idioma activo → idioma por defecto → primer valor', () => {
    const text = { es: 'Hola', en: 'Hello' };
    expect(pickLocalized(text, 'en')).toBe('Hello');
    expect(pickLocalized(text, 'fr', 'en')).toBe('Hello');
    expect(pickLocalized({ de: 'Hallo' }, 'fr', 'en')).toBe('Hallo');
    expect(pickLocalized(undefined, 'es')).toBe('');
  });

  it('admite códigos regionales ("es-ES" → "es")', () => {
    expect(pickLocalized({ es: 'Hola' }, 'es-ES')).toBe('Hola');
    expect(getBaseLanguage('en-GB')).toBe('en');
  });
});

describe('formatOpeningDays (M1: derivado de turnos)', () => {
  it('rango contiguo con envoltura de semana: martes a domingo', () => {
    expect(formatOpeningDays([0, 2, 3, 4, 5, 6], DAY_NAMES, 'Todos los días')).toBe('Mar – Dom');
  });

  it('los 7 días → etiqueta "todos los días"', () => {
    expect(formatOpeningDays([0, 1, 2, 3, 4, 5, 6], DAY_NAMES, 'Todos los días')).toBe('Todos los días');
  });

  it('días sueltos se listan; tramos cortos no se colapsan', () => {
    expect(formatOpeningDays([5, 6], DAY_NAMES, 'Todos')).toBe('Vie, Sáb');
    expect(formatOpeningDays([1], DAY_NAMES, 'Todos')).toBe('Lun');
  });

  it('sin días devuelve cadena vacía', () => {
    expect(formatOpeningDays([], DAY_NAMES, 'Todos')).toBe('');
  });
});

describe('formatPrice (M4: moneda configurable)', () => {
  it('formatea valores numéricos con la moneda configurada', () => {
    expect(formatPrice('12', 'EUR', 'es')).toMatch(/12/);
    expect(formatPrice('12', 'EUR', 'es')).toMatch(/€/);
    expect(formatPrice('12.5', 'USD', 'en')).toMatch(/\$/);
  });

  it('deja intactos los precios de texto libre', () => {
    expect(formatPrice('S. Mercado', 'EUR', 'es')).toBe('S. Mercado');
    expect(formatPrice('4.5 / 6€', 'EUR', 'es')).toBe('4.5 / 6€');
    expect(formatPrice('1€ P.P.', 'EUR', 'es')).toBe('1€ P.P.');
  });
});
