import { describe, it, expect } from 'vitest';
const { resolveEmailTexts, EMAIL_TEXTS } = require('../../locales/emailTexts');

// M5: los emails salen en el idioma del cliente, con cascada de fallback
// cliente → language_default de config → 'es'.
describe('emailTexts.resolveEmailTexts (M5)', () => {
  it('resuelve el idioma del cliente (formato de BD en minúsculas)', () => {
    expect(resolveEmailTexts('en', 'es').language).toBe('en');
    expect(resolveEmailTexts('fr', 'es').language).toBe('fr');
  });

  it('acepta el formato antiguo del enum (mayúsculas) y regionales', () => {
    expect(resolveEmailTexts('EN', 'es').language).toBe('en');
    expect(resolveEmailTexts('fr-FR', 'es').language).toBe('fr');
  });

  it('cae al idioma por defecto de config si el del cliente no tiene plantilla', () => {
    expect(resolveEmailTexts('de', 'en').language).toBe('en');
  });

  it('cae a español como último recurso', () => {
    expect(resolveEmailTexts('de', 'pt').language).toBe('es');
    expect(resolveEmailTexts(null, undefined).language).toBe('es');
  });

  it('las tres plantillas tienen las mismas claves', () => {
    const keys = Object.keys(EMAIL_TEXTS.es).sort();
    expect(Object.keys(EMAIL_TEXTS.en).sort()).toEqual(keys);
    expect(Object.keys(EMAIL_TEXTS.fr).sort()).toEqual(keys);
  });
});
