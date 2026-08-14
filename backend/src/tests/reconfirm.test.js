import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index';
const prisma = require('../config/database');
const socketManager = require('../socketManager');
const emitToBackoffice = vi.spyOn(socketManager, 'emitToBackoffice').mockImplementation(() => {});
const { daysFromFrozenNow } = require('./helpers/testDates');
const { combineDateAndTime } = require('../utils/dateHelpers');

const TOKEN = 'reconfirm-token-0001';
const FUTURE_DATE = daysFromFrozenNow(1);
const CUSTOMER = { id: 'c1', firstName: 'Ana', lastName: 'García', email: 'ana@example.com', phone: '+34600123456', language: 'es' };

// N1.2: POST /api/public/reservations/reconfirm/:token marca RECONFIRMED
// usando el reconfirmToken del email de recordatorio.
describe('reconfirmación en un clic (N1.2)', () => {
  function mockBooking(overrides = {}) {
    prisma.booking.findUnique.mockImplementation(({ where }) => {
      if (where.reconfirmToken === TOKEN) {
        return Promise.resolve({
          id: 'b1',
          date: combineDateAndTime(FUTURE_DATE, '13:00'),
          pax: 2,
          duration: 90,
          status: 'CONFIRMED',
          reconfirmToken: TOKEN,
          confirmationToken: 'conf-1',
          customer: CUSTOMER,
          table: { id: 1, name: 'Mesa 1', zone: { name: 'Sala' } },
          ...overrides
        });
      }
      return Promise.resolve(null);
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockBooking();
    prisma.booking.update.mockImplementation(async ({ data }) => ({
      id: 'b1',
      date: combineDateAndTime(FUTURE_DATE, '13:00'),
      pax: 2,
      duration: 90,
      status: 'CONFIRMED',
      ...data,
      customer: CUSTOMER,
      table: { id: 1, name: 'Mesa 1', zone: { name: 'Sala' } }
    }));
  });

  it('marca la reserva como RECONFIRMED con reconfirmedAt y emite el socket', async () => {
    const res = await request(app).post(`/api/public/reservations/reconfirm/${TOKEN}`);

    expect(res.status).toBe(200);
    expect(prisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'b1' },
        data: expect.objectContaining({
          status: 'RECONFIRMED',
          reconfirmedAt: expect.any(Date)
        })
      })
    );
    expect(emitToBackoffice).toHaveBeenCalledWith(
      'reservation_status_changed',
      expect.objectContaining({ id: 'b1', status: 'RECONFIRMED' })
    );
    // La respuesta enmascara la PII
    expect(JSON.stringify(res.body)).not.toContain(CUSTOMER.email);
  });

  it('es idempotente: una reserva ya RECONFIRMED devuelve éxito sin tocar nada', async () => {
    mockBooking({ status: 'RECONFIRMED' });
    const res = await request(app).post(`/api/public/reservations/reconfirm/${TOKEN}`);
    expect(res.status).toBe(200);
    expect(prisma.booking.update).not.toHaveBeenCalled();
  });

  it('token desconocido → 404', async () => {
    const res = await request(app).post('/api/public/reservations/reconfirm/token-falso');
    expect(res.status).toBe(404);
  });

  it('reserva cancelada o pasada → 410 TOKEN_EXPIRED', async () => {
    mockBooking({ status: 'CANCELLED' });
    const cancelled = await request(app).post(`/api/public/reservations/reconfirm/${TOKEN}`);
    expect(cancelled.status).toBe(410);
    expect(cancelled.body.type).toBe('TOKEN_EXPIRED');

    mockBooking({ date: combineDateAndTime(daysFromFrozenNow(-1), '13:00') });
    const past = await request(app).post(`/api/public/reservations/reconfirm/${TOKEN}`);
    expect(past.status).toBe(410);
  });
});
