import { describe, it, expect, vi, beforeEach } from 'vitest';

// N1.3: plantillas de ciclo de vida (cancelación, modificación, cierre).
// Se prueba la CONSTRUCCIÓN del email (asunto + HTML), nunca el envío real.
vi.unmock('../../services/emailService');

const prisma = require('../../config/database');
const {
  buildBookingCancellationEmail,
  buildBookingModificationEmail,
  buildClosureNoticeEmail
} = require('../../services/emailService');

const IDENTITY_ROWS = [
  { key: 'restaurant_name', value: 'Bar Test' },
  { key: 'restaurant_phone', value: '600 000 000' },
  { key: 'theme_primary', value: '#112233' },
  { key: 'theme_primary_light', value: '#334455' },
  { key: 'language_default', value: 'es' }
];

const BOOKING = {
  id: 'b1',
  date: new Date('2026-05-08T14:00:00'),
  pax: 4,
  table: { name: 'Mesa 3', zone: { name: 'Terraza' } }
};

describe('emails de ciclo de vida (N1.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.systemConfig.findMany.mockResolvedValue(IDENTITY_ROWS);
  });

  it('cancelación por el restaurante: disculpa + botón de re-reserva (en)', async () => {
    const customer = { firstName: 'Jane', email: 'jane@example.com', language: 'en' };
    const email = await buildBookingCancellationEmail(BOOKING, customer, { byRestaurant: true });

    expect(email.language).toBe('en');
    expect(email.subject).toBe('Booking cancelled - Bar Test');
    expect(email.html).toContain('cancel your booking');
    expect(email.html).toContain('/reservar');
    expect(email.html).toContain('Book again');
    // El tema del restaurante se aplica al HTML (M3)
    expect(email.html).toContain('#112233');
  });

  it('cancelación por el cliente: texto neutro, sin disculpa', async () => {
    const customer = { firstName: 'Jane', email: 'jane@example.com', language: 'en' };
    const email = await buildBookingCancellationEmail(BOOKING, customer);

    expect(email.html).toContain('Your booking has been cancelled');
    expect(email.html).not.toContain('sorry to inform');
  });

  it('modificación: nuevos datos en el idioma del cliente (fr)', async () => {
    const customer = { firstName: 'Marie', email: 'marie@example.com', language: 'fr' };
    const email = await buildBookingModificationEmail(BOOKING, customer);

    expect(email.language).toBe('fr');
    expect(email.subject).toBe('Réservation mise à jour - Bar Test');
    expect(email.html).toContain('mise à jour');
    expect(email.html).toContain('Terraza');
  });

  it('cierre sobrevenido: disculpa con el motivo y CTA de re-reserva (es)', async () => {
    const customer = { firstName: 'Ana', email: 'ana@example.com', language: 'es' };
    const email = await buildClosureNoticeEmail(BOOKING, customer, { reason: 'Obras en el local' });

    expect(email.language).toBe('es');
    expect(email.subject).toBe('Tu reserva ha sido cancelada - Bar Test');
    expect(email.html).toContain('Obras en el local');
    expect(email.html).toContain('Reservar de nuevo');
    expect(email.html).toContain('/reservar');
  });

  it('un idioma sin plantilla cae al idioma por defecto del restaurante', async () => {
    const customer = { firstName: 'Hans', email: 'hans@example.com', language: 'de' };
    const email = await buildBookingModificationEmail(BOOKING, customer);
    expect(email.language).toBe('es');
  });
});
