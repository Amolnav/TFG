import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
const prisma = require('../../config/database');
const { JWT_SECRET } = require('../../config/auth');

const adminToken = jwt.sign({ id: 'a', email: 'a@a.com', name: 'Admin', role: 'ADMIN' }, JWT_SECRET);
const staffToken = jwt.sign({ id: 's', email: 's@s.com', name: 'Staff', role: 'STAFF' }, JWT_SECRET);
const asAdmin = { Authorization: `Bearer ${adminToken}` };
const asStaff = { Authorization: `Bearer ${staffToken}` };

// M4: CRUD completo de turnos — un bar con turno único continuo o un brunch
// de fin de semana debe poder configurarse desde el panel.
describe('POST/DELETE /api/backoffice/shifts (M4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.staff.findUnique.mockImplementation(async ({ where }) => ({
      id: where.id,
      email: 'x@x.com',
      name: 'X',
      role: where.id === 's' ? 'STAFF' : 'ADMIN',
      isActive: true
    }));
    prisma.shift.create.mockImplementation(async ({ data }) => ({ id: 7, ...data }));
    prisma.shift.findUnique.mockResolvedValue({ id: 7, name: 'Continuo', startTime: '12:00', endTime: '23:30' });
    prisma.closure.deleteMany.mockResolvedValue({ count: 0 });
    prisma.shift.delete.mockResolvedValue({});
  });

  it('crea un turno único continuo válido', async () => {
    const res = await request(app)
      .post('/api/backoffice/shifts')
      .set(asAdmin)
      .send({
        name: 'Servicio continuo',
        startTime: '12:00',
        endTime: '23:30',
        slotInterval: 30,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        maxBookingsPerSlot: 4
      });
    expect(res.status).toBe(201);
    expect(prisma.shift.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ maxBookingsPerSlot: 4, slotInterval: 30 })
    }));
  });

  it('rechaza un turno sin días u horas incoherentes', async () => {
    const base = { name: 'Malo', slotInterval: 30, daysOfWeek: [1] };

    let res = await request(app).post('/api/backoffice/shifts').set(asAdmin)
      .send({ ...base, startTime: '20:00', endTime: '13:00' });
    expect(res.status).toBe(400);

    res = await request(app).post('/api/backoffice/shifts').set(asAdmin)
      .send({ ...base, startTime: '12:00', endTime: '16:00', daysOfWeek: [] });
    expect(res.status).toBe(400);

    res = await request(app).post('/api/backoffice/shifts').set(asAdmin)
      .send({ ...base, startTime: '12:00', endTime: '16:00', maxBookingsPerSlot: 0 });
    expect(res.status).toBe(400);

    expect(prisma.shift.create).not.toHaveBeenCalled();
  });

  it('borra un turno y limpia sus cierres asociados', async () => {
    const res = await request(app).delete('/api/backoffice/shifts/7').set(asAdmin);
    expect(res.status).toBe(200);
    expect(prisma.closure.deleteMany).toHaveBeenCalledWith({ where: { shiftId: 7 } });
    expect(prisma.shift.delete).toHaveBeenCalledWith({ where: { id: 7 } });
  });

  it('solo ADMIN puede crear o borrar turnos (BUG-03)', async () => {
    const create = await request(app).post('/api/backoffice/shifts').set(asStaff)
      .send({ name: 'X', startTime: '12:00', endTime: '16:00', daysOfWeek: [1] });
    expect(create.status).toBe(403);

    const del = await request(app).delete('/api/backoffice/shifts/7').set(asStaff);
    expect(del.status).toBe(403);
  });
});
