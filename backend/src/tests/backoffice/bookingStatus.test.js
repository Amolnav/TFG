import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
const prisma = require('../../config/database');
const { JWT_SECRET } = require('../../config/auth');
// Espía sobre el módulo compartido (los controladores llaman
// socketManager.emitToBackoffice(...) sin desestructurar)
const socketManager = require('../../socketManager');
const emitToBackoffice = vi.spyOn(socketManager, 'emitToBackoffice').mockImplementation(() => {});

const token = jwt.sign({ id: 'test', email: 'test@test.com', name: 'Test', role: 'ADMIN' }, JWT_SECRET);
const auth = { Authorization: `Bearer ${token}` };

function mockBooking(overrides = {}) {
  const booking = {
    id: 'b1',
    status: 'CONFIRMED',
    customerId: 'c1',
    pax: 2,
    date: new Date(),
    duration: 90,
    tableId: 1,
    customer: { id: 'c1', firstName: 'Ana', lastName: 'García', email: 'ana@example.com' },
    table: { id: 1, name: 'Mesa 1', zone: { name: 'Sala' } },
    ...overrides
  };
  prisma.booking.findUnique.mockResolvedValue(booking);
  return booking;
}

// BUG-12: los cambios de estado no validaban transiciones (COMPLETED → PENDING
// era posible) y marcar NO_SHOW dos veces incrementaba el contador dos veces.
// BUG-18: los cambios desde el back-office no emitían ningún evento socket.
describe('PATCH /api/backoffice/bookings/:id/status (BUG-12, BUG-18)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.booking.update.mockImplementation(async ({ data }) => ({ id: 'b1', ...data }));
    prisma.customer.update.mockResolvedValue({});
  });

  it('permite CONFIRMED → SEATED', async () => {
    mockBooking({ status: 'CONFIRMED' });
    const res = await request(app)
      .patch('/api/backoffice/bookings/b1/status')
      .set(auth)
      .send({ status: 'SEATED' });
    expect(res.status).toBe(200);
  });

  it('rechaza COMPLETED → PENDING con 409', async () => {
    mockBooking({ status: 'COMPLETED' });
    const res = await request(app)
      .patch('/api/backoffice/bookings/b1/status')
      .set(auth)
      .send({ status: 'PENDING' });
    expect(res.status).toBe(409);
    expect(prisma.booking.update).not.toHaveBeenCalled();
  });

  it('marcar NO_SHOW dos veces no duplica el contador (segunda vez → 409)', async () => {
    mockBooking({ status: 'CONFIRMED' });
    const first = await request(app)
      .patch('/api/backoffice/bookings/b1/status')
      .set(auth)
      .send({ status: 'NO_SHOW' });
    expect(first.status).toBe(200);
    expect(prisma.customer.update).toHaveBeenCalledTimes(1);

    mockBooking({ status: 'NO_SHOW' });
    const second = await request(app)
      .patch('/api/backoffice/bookings/b1/status')
      .set(auth)
      .send({ status: 'NO_SHOW' });
    expect(second.status).toBe(409);
    expect(prisma.customer.update).toHaveBeenCalledTimes(1);
  });

  it('corregir un NO_SHOW erróneo (→ CONFIRMED) decrementa el contador', async () => {
    mockBooking({ status: 'NO_SHOW' });
    const res = await request(app)
      .patch('/api/backoffice/bookings/b1/status')
      .set(auth)
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(200);
    const data = prisma.customer.update.mock.calls[0][0].data;
    expect(JSON.stringify(data)).toContain('decrement');
  });

  it('emite el evento socket reservation_status_changed (BUG-18)', async () => {
    mockBooking({ status: 'CONFIRMED' });
    await request(app)
      .patch('/api/backoffice/bookings/b1/status')
      .set(auth)
      .send({ status: 'SEATED' });
    expect(emitToBackoffice).toHaveBeenCalledWith(
      'reservation_status_changed',
      expect.objectContaining({ id: 'b1', status: 'SEATED' })
    );
  });
});

describe('DELETE /api/backoffice/bookings/:id (BUG-12, BUG-18)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.booking.update.mockImplementation(async ({ data }) => ({ id: 'b1', ...data }));
  });

  it('cancela una reserva activa y emite reservation_cancelled', async () => {
    mockBooking({ status: 'CONFIRMED' });
    const res = await request(app)
      .delete('/api/backoffice/bookings/b1')
      .set(auth);
    expect(res.status).toBe(200);
    expect(emitToBackoffice).toHaveBeenCalledWith(
      'reservation_cancelled',
      expect.objectContaining({ id: 'b1' })
    );
  });

  it('no permite cancelar una reserva COMPLETED (409)', async () => {
    mockBooking({ status: 'COMPLETED' });
    const res = await request(app)
      .delete('/api/backoffice/bookings/b1')
      .set(auth);
    expect(res.status).toBe(409);
  });
});
