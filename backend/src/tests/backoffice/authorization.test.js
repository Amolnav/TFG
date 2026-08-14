import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
const prisma = require('../../config/database');
const { JWT_SECRET } = require('../../config/auth');

const adminToken = jwt.sign({ id: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'ADMIN' }, JWT_SECRET);
const staffToken = jwt.sign({ id: 'staff-1', email: 'staff@test.com', name: 'Staff', role: 'STAFF' }, JWT_SECRET);

function mockStaff(overrides = {}) {
  prisma.staff.findUnique.mockResolvedValue({
    id: 'admin-1',
    email: 'admin@test.com',
    name: 'Admin',
    role: 'ADMIN',
    isActive: true,
    ...overrides
  });
}

// BUG-03: no existía autorización por roles ni re-verificación de isActive:
// cualquier STAFF podía borrar zonas o cambiar la configuración, y una
// cuenta desactivada seguía operando hasta caducar su token.
describe('autorización por roles y cuentas activas (BUG-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStaff();
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.count.mockResolvedValue(0);
    prisma.systemConfig.findMany.mockResolvedValue([]);
    prisma.systemConfig.upsert.mockResolvedValue({});
    prisma.table.findMany.mockResolvedValue([]);
    prisma.table.delete.mockResolvedValue({});
  });

  it('un STAFF no puede cambiar la configuración (403)', async () => {
    mockStaff({ id: 'staff-1', role: 'STAFF' });
    const res = await request(app)
      .patch('/api/backoffice/config')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ restaurant_name: 'Otro nombre' });
    expect(res.status).toBe(403);
    expect(prisma.systemConfig.upsert).not.toHaveBeenCalled();
  });

  it('un STAFF no puede borrar mesas (403)', async () => {
    mockStaff({ id: 'staff-1', role: 'STAFF' });
    const res = await request(app)
      .delete('/api/backoffice/zones/tables/5')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
    expect(prisma.table.delete).not.toHaveBeenCalled();
  });

  it('un STAFF sí puede listar reservas (200)', async () => {
    mockStaff({ id: 'staff-1', role: 'STAFF' });
    const res = await request(app)
      .get('/api/backoffice/bookings')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
  });

  it('una cuenta desactivada recibe 403 aunque su token sea válido', async () => {
    mockStaff({ isActive: false });
    const res = await request(app)
      .get('/api/backoffice/bookings')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it('un token de un staff que ya no existe recibe 401', async () => {
    prisma.staff.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .get('/api/backoffice/bookings')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(401);
  });

  it('un ADMIN activo puede cambiar la configuración (200)', async () => {
    const res = await request(app)
      .patch('/api/backoffice/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ restaurant_name: 'Otro nombre' });
    expect(res.status).toBe(200);
  });
});
