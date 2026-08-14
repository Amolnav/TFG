import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const prisma = require('../../config/database');
const emailService = require('../../services/emailService');
const sendReviewRequest = vi.spyOn(emailService, 'sendReviewRequest').mockResolvedValue(undefined);
const { maybeSendReviewRequest } = require('../../services/reviewRequestService');

// N3.4: la petición de reseña se activa por config, exige GOOGLE_PLACE_ID y
// respeta la cadencia por cliente vía BookingEvent (guarda persistente).

function mockConfig(rows) {
  prisma.systemConfig.findMany.mockResolvedValue(
    Object.entries(rows).map(([key, value]) => ({ key, value }))
  );
}

const BOOKING = {
  id: 'b1',
  customerId: 'c1',
  date: new Date('2026-04-14T14:00:00'),
  pax: 2,
  customer: { id: 'c1', firstName: 'Ana', email: 'ana@example.com', language: 'es' }
};

describe('petición de reseña post-visita (N3.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig({ review_request_enabled: 'true' });
    prisma.bookingEvent.findFirst.mockResolvedValue(null);
    prisma.bookingEvent.create.mockResolvedValue({});
    process.env.GOOGLE_PLACE_ID = 'test-place-id';
  });

  afterEach(() => {
    delete process.env.GOOGLE_PLACE_ID;
  });

  it('envía la reseña con el enlace de Google y registra el BookingEvent', async () => {
    const sent = await maybeSendReviewRequest(BOOKING);

    expect(sent).toBe(true);
    // La guarda se persiste ANTES de enviar
    expect(prisma.bookingEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bookingId: 'b1', type: 'REVIEW_REQUEST_SENT' })
      })
    );
    expect(sendReviewRequest).toHaveBeenCalledWith(
      BOOKING,
      BOOKING.customer,
      { reviewUrl: 'https://search.google.com/local/writereview?placeid=test-place-id' }
    );
  });

  it('desactivada por defecto: no envía nada', async () => {
    mockConfig({});
    const sent = await maybeSendReviewRequest(BOOKING);
    expect(sent).toBe(false);
    expect(sendReviewRequest).not.toHaveBeenCalled();
  });

  it('sin GOOGLE_PLACE_ID no envía nada', async () => {
    delete process.env.GOOGLE_PLACE_ID;
    const sent = await maybeSendReviewRequest(BOOKING);
    expect(sent).toBe(false);
    expect(sendReviewRequest).not.toHaveBeenCalled();
  });

  it('respeta la cadencia: si hay una petición reciente al cliente, no repite', async () => {
    prisma.bookingEvent.findFirst.mockResolvedValue({ id: 'ev1', createdAt: new Date() });
    const sent = await maybeSendReviewRequest(BOOKING);

    expect(sent).toBe(false);
    expect(sendReviewRequest).not.toHaveBeenCalled();
    // La cadencia se consulta por cliente, no por reserva
    const where = prisma.bookingEvent.findFirst.mock.calls[0][0].where;
    expect(where.booking).toEqual({ customerId: 'c1' });
    expect(where.type).toBe('REVIEW_REQUEST_SENT');
  });

  it('la ventana de cadencia sale de la configuración', async () => {
    mockConfig({ review_request_enabled: 'true', review_request_min_days_between: '7' });
    await maybeSendReviewRequest(BOOKING);

    const where = prisma.bookingEvent.findFirst.mock.calls[0][0].where;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(Date.now() - where.createdAt.gt.getTime()).toBe(sevenDaysMs);
  });

  it('nunca lanza: un error de BD se traga y devuelve false', async () => {
    prisma.bookingEvent.findFirst.mockRejectedValue(new Error('db down'));
    const sent = await maybeSendReviewRequest(BOOKING);
    expect(sent).toBe(false);
  });
});
