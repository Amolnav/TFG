import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
const prisma = require('../../config/database');
const { JWT_SECRET } = require('../../config/auth');
const { daysFromFrozenNow } = require('../helpers/testDates');
const { combineDateAndTime } = require('../../utils/dateHelpers');

const token = jwt.sign({ id: 'test', email: 'test@test.com', name: 'María Sala', role: 'ADMIN' }, JWT_SECRET);
const auth = { Authorization: `Bearer ${token}` };
const FUTURE_DATE = daysFromFrozenNow(10);
const CUSTOMER = { id: 'c1', firstName: 'Ana', lastName: 'García', email: 'ana@example.com', language: 'es' };

// N2.5: cada punto de mutación registra un BookingEvent (quién, qué, cuándo,
// snapshot). "¿Quién movió esta mesa?" queda respondido en el timeline.
describe('auditoría de reservas (N2.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.staff.findUnique.mockResolvedValue({ id: 'test', email: 'test@test.com', name: 'María Sala', role: 'ADMIN', isActive: true });
    prisma.booking.findUnique.mockResolvedValue({
      id: 'b1',
      date: combineDateAndTime(FUTURE_DATE, '13:00'),
      pax: 2,
      duration: 90,
      tableId: 1,
      status: 'CONFIRMED',
      customer: CUSTOMER,
      table: { id: 1, name: 'Mesa 1', zone: { name: 'Sala' } }
    });
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

  it('cambiar el estado registra STATUS_CHANGED con el actor y el snapshot', async () => {
    const res = await request(app)
      .patch('/api/backoffice/bookings/b1/status')
      .set(auth)
      .send({ status: 'SEATED' });

    expect(res.status).toBe(200);
    expect(prisma.bookingEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bookingId: 'b1',
          type: 'STATUS_CHANGED',
          actor: 'María Sala',
          payload: { from: 'CONFIRMED', to: 'SEATED' }
        })
      })
    );
  });

  it('cancelar (DELETE) registra CANCELLED con el actor', async () => {
    const res = await request(app).delete('/api/backoffice/bookings/b1').set(auth);
    expect(res.status).toBe(200);
    expect(prisma.bookingEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'CANCELLED', actor: 'María Sala' })
      })
    );
  });

  it('reasignar mesa registra TABLE_REASSIGNED', async () => {
    prisma.table.findUnique.mockResolvedValue({ id: 2, name: 'Mesa 2', isActive: true, minCapacity: 2, maxCapacity: 4, zone: { name: 'Sala' } });
    prisma.booking.findMany.mockResolvedValue([]);

    const res = await request(app)
      .post('/api/backoffice/bookings/b1/reassign')
      .set(auth)
      .send({ tableId: 2 });

    expect(res.status).toBe(200);
    expect(prisma.bookingEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'TABLE_REASSIGNED',
          actor: 'María Sala',
          payload: expect.objectContaining({ toTableId: 2 })
        })
      })
    );
  });

  it('un fallo al auditar NO rompe la operación principal', async () => {
    prisma.bookingEvent.create.mockRejectedValue(new Error('db down'));
    const res = await request(app)
      .patch('/api/backoffice/bookings/b1/status')
      .set(auth)
      .send({ status: 'SEATED' });
    expect(res.status).toBe(200);
  });

  it('GET /api/backoffice/bookings/:id/events devuelve el timeline', async () => {
    prisma.bookingEvent.findMany.mockResolvedValue([
      { id: 'ev2', bookingId: 'b1', type: 'STATUS_CHANGED', actor: 'María Sala', payload: { from: 'CONFIRMED', to: 'SEATED' }, createdAt: new Date() },
      { id: 'ev1', bookingId: 'b1', type: 'CREATED', actor: 'cliente', payload: null, createdAt: new Date() }
    ]);

    const res = await request(app).get('/api/backoffice/bookings/b1/events').set(auth);

    expect(res.status).toBe(200);
    expect(res.body.data.events).toHaveLength(2);
    expect(res.body.data.events[0].type).toBe('STATUS_CHANGED');
    expect(prisma.bookingEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingId: 'b1' },
        orderBy: { createdAt: 'desc' }
      })
    );
  });
});
