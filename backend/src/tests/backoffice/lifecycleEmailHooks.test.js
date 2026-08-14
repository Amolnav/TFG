import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
const prisma = require('../../config/database');
const { JWT_SECRET } = require('../../config/auth');
// Espía sobre el módulo compartido (mismo patrón que socketManager en
// bookingEdit.test.js: los controladores llaman emailService.sendX(...))
const emailService = require('../../services/emailService');
const sendBookingCancellation = vi.spyOn(emailService, 'sendBookingCancellation').mockResolvedValue(undefined);
const sendBookingModification = vi.spyOn(emailService, 'sendBookingModification').mockResolvedValue(undefined);
const sendClosureNotice = vi.spyOn(emailService, 'sendClosureNotice').mockResolvedValue(undefined);
const { daysFromFrozenNow } = require('../helpers/testDates');
const { combineDateAndTime } = require('../../utils/dateHelpers');

const token = jwt.sign({ id: 'test', email: 'test@test.com', name: 'Test', role: 'ADMIN' }, JWT_SECRET);
const auth = { Authorization: `Bearer ${token}` };

const FUTURE_DATE = daysFromFrozenNow(10);
const CUSTOMER = { id: 'c1', firstName: 'Ana', lastName: 'García', email: 'ana@example.com', language: 'es' };

// N1.3: los puntos de mutación de reservas disparan los emails de ciclo de
// vida (el servicio de email está mockeado por el setup global).
describe('hooks de emails de ciclo de vida (N1.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.staff.findUnique.mockResolvedValue({ id: 'test', email: 'test@test.com', name: 'Test', role: 'ADMIN', isActive: true });
    prisma.shift.findMany.mockResolvedValue([
      { id: 1, name: 'Continuo', startTime: '10:00', endTime: '16:00', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], slotInterval: 30, isActive: true }
    ]);
    prisma.closure.findMany.mockResolvedValue([]);
    prisma.table.findFirst.mockResolvedValue({ maxCapacity: 10 });
    prisma.table.findUnique.mockResolvedValue({ id: 1, name: 'Mesa 1', isActive: true, minCapacity: 2, maxCapacity: 4, zone: { name: 'Sala' } });
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.update.mockImplementation(async ({ data }) => ({
      id: 'b1',
      date: combineDateAndTime(FUTURE_DATE, '13:00'),
      pax: 2,
      status: 'CONFIRMED',
      ...data,
      customer: CUSTOMER,
      table: { id: 1, name: 'Mesa 1', zone: { name: 'Sala' } }
    }));
    prisma.customer.update.mockResolvedValue({});
  });

  function mockBooking(overrides = {}) {
    prisma.booking.findUnique.mockResolvedValue({
      id: 'b1',
      date: combineDateAndTime(FUTURE_DATE, '13:00'),
      pax: 2,
      duration: 90,
      tableId: 1,
      status: 'CONFIRMED',
      customer: CUSTOMER,
      table: { id: 1, name: 'Mesa 1', zone: { name: 'Sala' } },
      ...overrides
    });
  }

  it('cancelar vía PATCH /status envía email de cancelación (byRestaurant)', async () => {
    mockBooking();
    const res = await request(app)
      .patch('/api/backoffice/bookings/b1/status')
      .set(auth)
      .send({ status: 'CANCELLED' });

    expect(res.status).toBe(200);
    expect(sendBookingCancellation).toHaveBeenCalledTimes(1);
    expect(sendBookingCancellation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b1' }),
      expect.objectContaining({ email: 'ana@example.com' }),
      { byRestaurant: true }
    );
  });

  it('otros cambios de estado NO envían email de cancelación', async () => {
    mockBooking();
    const res = await request(app)
      .patch('/api/backoffice/bookings/b1/status')
      .set(auth)
      .send({ status: 'SEATED' });

    expect(res.status).toBe(200);
    expect(sendBookingCancellation).not.toHaveBeenCalled();
  });

  it('DELETE (cancelación) envía email de cancelación', async () => {
    mockBooking();
    const res = await request(app)
      .delete('/api/backoffice/bookings/b1')
      .set(auth);

    expect(res.status).toBe(200);
    expect(sendBookingCancellation).toHaveBeenCalledTimes(1);
  });

  it('cambiar fecha/hora vía PATCH envía email de modificación', async () => {
    mockBooking();
    const res = await request(app)
      .patch('/api/backoffice/bookings/b1')
      .set(auth)
      .send({ date: FUTURE_DATE, time: '14:30' });

    expect(res.status).toBe(200);
    expect(sendBookingModification).toHaveBeenCalledTimes(1);
  });

  it('cambiar solo el pax NO envía email de modificación', async () => {
    mockBooking();
    const res = await request(app)
      .patch('/api/backoffice/bookings/b1')
      .set(auth)
      .send({ pax: 3 });

    expect(res.status).toBe(200);
    expect(sendBookingModification).not.toHaveBeenCalled();
  });

  describe('cierre sobrevenido (POST /closures con notifyAffected)', () => {
    beforeEach(() => {
      prisma.closure.create.mockResolvedValue({
        id: 'cl1',
        startDate: new Date(`${FUTURE_DATE}T00:00:00`),
        endDate: null,
        reason: 'Avería en cocina',
        isFullDay: true,
        shiftId: null,
        shift: null,
        createdBy: 'Test'
      });
    });

    it('cancela las reservas vivas del día y les envía el aviso de cierre', async () => {
      prisma.booking.findMany.mockResolvedValue([
        {
          id: 'b9',
          date: combineDateAndTime(FUTURE_DATE, '13:00'),
          pax: 4,
          status: 'CONFIRMED',
          customer: CUSTOMER,
          table: { id: 1, name: 'Mesa 1', zone: { name: 'Sala' } }
        }
      ]);

      const res = await request(app)
        .post('/api/backoffice/closures')
        .set(auth)
        .send({ startDate: FUTURE_DATE, reason: 'Avería en cocina', notifyAffected: true });

      expect(res.status).toBe(201);
      expect(res.body.data.cancelledBookings).toBe(1);
      expect(prisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b9' },
          data: expect.objectContaining({ status: 'CANCELLED' })
        })
      );
      expect(sendClosureNotice).toHaveBeenCalledTimes(1);
      expect(sendClosureNotice).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'b9' }),
        expect.objectContaining({ email: 'ana@example.com' }),
        { reason: 'Avería en cocina' }
      );
    });

    it('sin notifyAffected no cancela ni envía nada (comportamiento previo)', async () => {
      const res = await request(app)
        .post('/api/backoffice/closures')
        .set(auth)
        .send({ startDate: FUTURE_DATE, reason: 'Cierre normal' });

      expect(res.status).toBe(201);
      expect(prisma.booking.update).not.toHaveBeenCalled();
      expect(sendClosureNotice).not.toHaveBeenCalled();
    });
  });
});
