import { describe, it, expect, vi, beforeEach } from 'vitest';
const prisma = require('../../config/database');

// El setup global mockea ../services/emailService para el resto de suites;
// aquí necesitamos la implementación REAL.
vi.unmock('../../services/emailService');
const { buildBookingConfirmationEmail } = require('../../services/emailService');

// M1/M3/M5: el email lee identidad y tema de SystemConfig (nada hardcodeado)
// y sale en el idioma del cliente.
describe('emailService.buildBookingConfirmationEmail', () => {
  const booking = {
    date: new Date('2026-09-01T13:30:00'),
    pax: 2,
    table: { name: 'T1', zone: { name: 'Terraza' } }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('usa la identidad y colores de config (marca nueva, sin restos de defaults)', async () => {
    prisma.systemConfig.findMany.mockResolvedValue([
      { key: 'restaurant_name', value: 'Bar Ejemplo' },
      { key: 'restaurant_address', value: 'Plaza Mayor, 1' },
      { key: 'restaurant_phone', value: '900 000 000' },
      { key: 'theme_primary', value: '#14532D' },
      { key: 'theme_primary_light', value: '#166534' },
      { key: 'font_body', value: 'system-ui, sans-serif' },
      { key: 'language_default', value: 'en' }
    ]);

    const email = await buildBookingConfirmationEmail(booking, {
      firstName: 'Emma', email: 'emma@example.com', language: 'en'
    });

    expect(email.subject).toBe('Booking Confirmation - Bar Ejemplo');
    expect(email.html).toContain('Bar Ejemplo');
    expect(email.html).toContain('Plaza Mayor, 1');
    expect(email.html).toContain('900 000 000');
    expect(email.html).toContain('#14532D');
    expect(email.html).toContain('system-ui, sans-serif');
    expect(email.html).not.toMatch(/marinero|montserrat|004e92/i);
  });

  it('sale en el idioma del cliente (M5), con fallback al idioma por defecto', async () => {
    prisma.systemConfig.findMany.mockResolvedValue([
      { key: 'restaurant_name', value: 'Bar Ejemplo' },
      { key: 'language_default', value: 'es' }
    ]);

    const french = await buildBookingConfirmationEmail(booking, { firstName: 'Zoé', language: 'fr' });
    expect(french.language).toBe('fr');
    expect(french.subject).toContain('Confirmation de Réservation');

    // Idioma sin plantilla → cae al idioma por defecto del despliegue
    const fallback = await buildBookingConfirmationEmail(booking, { firstName: 'Ute', language: 'de' });
    expect(fallback.language).toBe('es');

    // Formato antiguo del enum en mayúsculas sigue funcionando
    const legacy = await buildBookingConfirmationEmail(booking, { firstName: 'Emma', language: 'EN' });
    expect(legacy.language).toBe('en');
  });

  it('sin configurar usa el default neutro "Mi Restaurante"', async () => {
    prisma.systemConfig.findMany.mockResolvedValue([]);

    const email = await buildBookingConfirmationEmail(booking, { firstName: 'Ana', language: 'es' });
    expect(email.subject).toContain('Mi Restaurante');
    expect(email.html).toContain('Mi Restaurante');
  });
});
