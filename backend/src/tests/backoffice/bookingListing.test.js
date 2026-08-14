import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
const prisma = require('../../config/database');
const { JWT_SECRET } = require('../../config/auth');

const token = jwt.sign({ id: 'test', email: 'test@test.com', name: 'Test', role: 'ADMIN' }, JWT_SECRET);
const auth = { Authorization: `Bearer ${token}` };

// BUG-23: getAllBookings traía TODOS los ids que casaban con el filtro a
// memoria y paginaba en JavaScript. La paginación debe resolverse en SQL:
// una query de ids paginada + una query con include para esa página.
describe('GET /api/backoffice/bookings — paginación en SQL (BUG-23)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([{ id: 'b1' }, { id: 'b2' }]);
    prisma.booking.count.mockResolvedValue(2);
    prisma.booking.findMany.mockResolvedValue([
      { id: 'b2', date: new Date(), pax: 2, status: 'CONFIRMED', customer: {}, table: null },
      { id: 'b1', date: new Date(), pax: 4, status: 'CONFIRMED', customer: {}, table: null }
    ]);
  });

  it('hace una única findMany (la de la página con include)', async () => {
    const res = await request(app)
      .get('/api/backoffice/bookings')
      .set(auth);

    expect(res.status).toBe(200);
    expect(prisma.booking.findMany).toHaveBeenCalledTimes(1);
  });

  it('respeta el orden de proximidad devuelto por SQL', async () => {
    const res = await request(app)
      .get('/api/backoffice/bookings')
      .set(auth);

    const ids = res.body.data.bookings.map((b) => b.id);
    expect(ids).toEqual(['b1', 'b2']);
  });

  it('devuelve la paginación con el total', async () => {
    prisma.booking.count.mockResolvedValue(120);
    const res = await request(app)
      .get('/api/backoffice/bookings')
      .set(auth)
      .query({ page: 2, limit: 50 });

    expect(res.body.data.pagination.total).toBe(120);
    expect(res.body.data.pagination.pages).toBe(3);
  });
});
