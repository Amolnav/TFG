import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
const prisma = require('../../config/database');
const { JWT_SECRET } = require('../../config/auth');

const token = jwt.sign({ id: 'test', email: 'test@test.com', name: 'Test', role: 'ADMIN' }, JWT_SECRET);
const auth = { Authorization: `Bearer ${token}` };

// BUG-13: borrar una mesa/zona era un delete físico que dejaba las reservas
// futuras con tableId = NULL (SetNull), invisibles para la disponibilidad.
describe('borrado de mesas y zonas con reservas futuras (BUG-13)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.table.delete.mockResolvedValue({});
    prisma.zone.delete.mockResolvedValue({});
  });

  it('DELETE mesa con reservas futuras activas responde 409 con el recuento', async () => {
    prisma.booking.count.mockResolvedValue(2);

    const res = await request(app)
      .delete('/api/backoffice/zones/tables/5')
      .set(auth);

    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain('2');
    expect(prisma.table.delete).not.toHaveBeenCalled();
  });

  it('DELETE mesa sin reservas futuras la elimina', async () => {
    prisma.booking.count.mockResolvedValue(0);

    const res = await request(app)
      .delete('/api/backoffice/zones/tables/5')
      .set(auth);

    expect(res.status).toBe(200);
    expect(prisma.table.delete).toHaveBeenCalled();
  });

  it('DELETE zona con reservas futuras activas responde 409', async () => {
    prisma.booking.count.mockResolvedValue(3);

    const res = await request(app)
      .delete('/api/backoffice/zones/1')
      .set(auth);

    expect(res.status).toBe(409);
    expect(prisma.zone.delete).not.toHaveBeenCalled();
  });

  it('DELETE zona sin reservas futuras la elimina', async () => {
    prisma.booking.count.mockResolvedValue(0);

    const res = await request(app)
      .delete('/api/backoffice/zones/1')
      .set(auth);

    expect(res.status).toBe(200);
    expect(prisma.zone.delete).toHaveBeenCalled();
  });
});
