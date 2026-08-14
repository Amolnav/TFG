import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
const prisma = require('../../config/database');
const { JWT_SECRET } = require('../../config/auth');
const socketManager = require('../../socketManager');
const emitToBackoffice = vi.spyOn(socketManager, 'emitToBackoffice').mockImplementation(() => {});

const token = jwt.sign({ id: 'test', email: 'test@test.com', name: 'María Sala', role: 'STAFF' }, JWT_SECRET);
const auth = { Authorization: `Bearer ${token}` };

// N2.2: walk-in — sentar un grupo AHORA con datos mínimos y source WALK_IN.
describe('walk-in (N2.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.staff.findUnique.mockResolvedValue({ id: 'test', email: 'test@test.com', name: 'María Sala', role: 'STAFF', isActive: true });
    prisma.table.findUnique.mockResolvedValue({ id: 3, name: 'Mesa 3', isActive: true, minCapacity: 2, maxCapacity: 4 });
    prisma.booking.findMany.mockResolvedValue([]); // mesa libre
    prisma.customer.findUnique.mockResolvedValue(null);
    prisma.customer.create.mockImplementation(async ({ data }) => ({ id: 'walkin-c', ...data }));
    prisma.booking.create.mockImplementation(async ({ data }) => ({
      id: 'wb1',
      ...data,
      customer: { id: 'walkin-c', firstName: 'Walk-in', lastName: '' },
      table: { id: 3, name: 'Mesa 3', zone: { name: 'Sala' } }
    }));
  });

  it('sienta al grupo AHORA: estado SEATED, source WALK_IN y socket al panel', async () => {
    const res = await request(app)
      .post('/api/backoffice/bookings/walkin')
      .set(auth)
      .send({ tableId: 3, pax: 3, name: 'Mesa de Juan' });

    expect(res.status).toBe(201);
    const createArgs = prisma.booking.create.mock.calls[0][0].data;
    expect(createArgs.status).toBe('SEATED');
    expect(createArgs.source).toBe('WALK_IN');
    expect(createArgs.seatedAt).toBeInstanceOf(Date);
    expect(createArgs.specialRequests).toContain('Juan');
    expect(emitToBackoffice).toHaveBeenCalledWith(
      'new_reservation',
      expect.objectContaining({ id: 'wb1' })
    );
  });

  it('reutiliza el cliente sintético walkin@local si ya existe', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'walkin-c', email: 'walkin@local' });
    const res = await request(app)
      .post('/api/backoffice/bookings/walkin')
      .set(auth)
      .send({ tableId: 3, pax: 2 });

    expect(res.status).toBe(201);
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  it('rechaza mesa ocupada (409 TABLE_OCCUPIED)', async () => {
    // Reserva en curso ahora mismo en esa mesa (solapa con el walk-in)
    prisma.booking.findMany.mockResolvedValue([
      { id: 'other', date: new Date(), duration: 90, status: 'SEATED' }
    ]);
    const res = await request(app)
      .post('/api/backoffice/bookings/walkin')
      .set(auth)
      .send({ tableId: 3, pax: 2 });

    expect(res.status).toBe(409);
    expect(res.body.type).toBe('TABLE_OCCUPIED');
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it('rechaza un grupo mayor que la capacidad de la mesa (409)', async () => {
    const res = await request(app)
      .post('/api/backoffice/bookings/walkin')
      .set(auth)
      .send({ tableId: 3, pax: 8 });

    expect(res.status).toBe(409);
    expect(res.body.type).toBe('TABLE_INSUFFICIENT_CAPACITY');
  });

  it('faltan mesa o pax → 400', async () => {
    const res = await request(app)
      .post('/api/backoffice/bookings/walkin')
      .set(auth)
      .send({ pax: 2 });
    expect(res.status).toBe(400);
  });
});
