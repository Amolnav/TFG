import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index';
const prisma = require('../config/database');
const emailService = require('../services/emailService');
const sendBookingCancellation = vi.spyOn(emailService, 'sendBookingCancellation').mockResolvedValue(undefined);
const sendBookingModification = vi.spyOn(emailService, 'sendBookingModification').mockResolvedValue(undefined);
const socketManager = require('../socketManager');
const emitToBackoffice = vi.spyOn(socketManager, 'emitToBackoffice').mockImplementation(() => {});
const { daysFromFrozenNow } = require('./helpers/testDates');
const { combineDateAndTime } = require('../utils/dateHelpers');

const TOKEN = 'tok-autogestion-0001';
const FUTURE_DATE = daysFromFrozenNow(10);
const CUSTOMER = {
  id: 'c1',
  firstName: 'Ana',
  lastName: 'García',
  email: 'ana.garcia@example.com',
  phone: '+34600123456',
  language: 'es'
};

// N1.1: autogestión de reserva por enlace público /reserva/:token usando el
// Booking.confirmationToken existente. El token es una capacidad de acceso:
// la página nunca muestra la PII completa.
describe('autogestión de reserva por enlace (N1.1)', () => {
  function mockManagedBooking(overrides = {}) {
    prisma.booking.findUnique.mockImplementation(({ where }) => {
      if (where.confirmationToken === TOKEN) {
        return Promise.resolve({
          id: 'b1',
          date: combineDateAndTime(FUTURE_DATE, '13:00'),
          pax: 2,
          duration: 90,
          status: 'CONFIRMED',
          tableId: 1,
          confirmationToken: TOKEN,
          customer: CUSTOMER,
          table: { id: 1, name: 'Mesa 1', zone: { name: 'Terraza' } },
          ...overrides
        });
      }
      return Promise.resolve(null);
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockManagedBooking();
    prisma.shift.findMany.mockResolvedValue([
      { id: 1, name: 'Continuo', startTime: '10:00', endTime: '16:00', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], slotInterval: 30, isActive: true }
    ]);
    prisma.closure.findMany.mockResolvedValue([]);
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.table.findMany.mockResolvedValue([
      { id: 1, name: 'Mesa 1', isActive: true, minCapacity: 2, maxCapacity: 4, zone: { name: 'Terraza' } }
    ]);
    prisma.booking.update.mockImplementation(async ({ data }) => ({
      id: 'b1',
      date: combineDateAndTime(FUTURE_DATE, '13:00'),
      pax: 2,
      duration: 90,
      status: 'CONFIRMED',
      ...data,
      customer: CUSTOMER,
      table: { id: 1, name: 'Mesa 1', zone: { name: 'Terraza' } }
    }));
  });

  describe('GET /api/public/reservations/manage/:token', () => {
    it('devuelve la reserva con email y teléfono ENMASCARADOS', async () => {
      const res = await request(app).get(`/api/public/reservations/manage/${TOKEN}`);

      expect(res.status).toBe(200);
      const { booking, customer, canManage } = res.body.data;
      expect(booking.pax).toBe(2);
      expect(booking.table).toEqual({ name: 'Mesa 1', zone: 'Terraza' });
      expect(canManage).toBe(true);
      expect(customer.firstName).toBe('Ana');
      // PII nunca completa
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('ana.garcia@example.com');
      expect(serialized).not.toContain('600123456');
      expect(customer.emailMasked).toMatch(/^a\*\*\*a@e\*\*\*e\.com$/);
      expect(customer.phoneMasked).toContain('456');
    });

    it('un token desconocido devuelve 404', async () => {
      const res = await request(app).get('/api/public/reservations/manage/token-inexistente');
      expect(res.status).toBe(404);
    });

    it('una reserva ya completada se muestra pero no es gestionable', async () => {
      mockManagedBooking({ status: 'COMPLETED' });
      const res = await request(app).get(`/api/public/reservations/manage/${TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data.canManage).toBe(false);
    });
  });

  describe('POST /manage/:token/cancel', () => {
    it('cancela la reserva, emite el socket y envía el email de cancelación', async () => {
      const res = await request(app).post(`/api/public/reservations/manage/${TOKEN}/cancel`);

      expect(res.status).toBe(200);
      expect(prisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b1' },
          data: expect.objectContaining({ status: 'CANCELLED' })
        })
      );
      expect(emitToBackoffice).toHaveBeenCalledWith(
        'reservation_cancelled',
        expect.objectContaining({ id: 'b1' })
      );
      expect(sendBookingCancellation).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'b1' }),
        expect.objectContaining({ email: CUSTOMER.email }),
        { byRestaurant: false }
      );
    });

    it('no permite cancelar una reserva pasada o terminada (410 TOKEN_EXPIRED)', async () => {
      mockManagedBooking({ status: 'COMPLETED' });
      const res = await request(app).post(`/api/public/reservations/manage/${TOKEN}/cancel`);
      expect(res.status).toBe(410);
      expect(res.body.type).toBe('TOKEN_EXPIRED');
      expect(prisma.booking.update).not.toHaveBeenCalled();
    });

    it('no permite cancelar con fecha ya pasada (410)', async () => {
      mockManagedBooking({ date: combineDateAndTime(daysFromFrozenNow(-1), '13:00') });
      const res = await request(app).post(`/api/public/reservations/manage/${TOKEN}/cancel`);
      expect(res.status).toBe(410);
    });
  });

  describe('POST /manage/:token/reschedule', () => {
    it('cambia la hora contra disponibilidad real y envía email de modificación', async () => {
      const res = await request(app)
        .post(`/api/public/reservations/manage/${TOKEN}/reschedule`)
        .send({ date: FUTURE_DATE, time: '14:30' });

      expect(res.status).toBe(200);
      expect(prisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b1' },
          data: expect.objectContaining({ tableId: 1 })
        })
      );
      expect(emitToBackoffice).toHaveBeenCalledWith(
        'reservation_updated',
        expect.objectContaining({ id: 'b1' })
      );
      expect(sendBookingModification).toHaveBeenCalledTimes(1);
      // La respuesta sigue enmascarando la PII
      expect(JSON.stringify(res.body)).not.toContain(CUSTOMER.email);
    });

    it('rechaza horas fuera de turno', async () => {
      const res = await request(app)
        .post(`/api/public/reservations/manage/${TOKEN}/reschedule`)
        .send({ date: FUTURE_DATE, time: '23:00' });

      expect([400, 409]).toContain(res.status);
      expect(prisma.booking.update).not.toHaveBeenCalled();
      expect(sendBookingModification).not.toHaveBeenCalled();
    });

    it('aplica la antelación mínima del canal público', async () => {
      // FROZEN_NOW es 10:00 → reservar hoy a las 11:00 viola las 2h por defecto
      const res = await request(app)
        .post(`/api/public/reservations/manage/${TOKEN}/reschedule`)
        .send({ date: daysFromFrozenNow(0), time: '11:00' });

      expect(res.status).toBe(400);
      expect(prisma.booking.update).not.toHaveBeenCalled();
    });
  });
});
