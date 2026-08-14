import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
const prisma = require('../../config/database');
const { JWT_SECRET } = require('../../config/auth');

const token = jwt.sign({ id: 'test', email: 'test@test.com', name: 'Test', role: 'ADMIN' }, JWT_SECRET);
const auth = { Authorization: `Bearer ${token}` };

// BUG-17: updateShift aceptaba cualquier valor. Un slotInterval de 0 colgaba
// el servidor (bucle infinito en generateTimeSlots) y horas/días corruptos
// rompían silenciosamente toda la disponibilidad.
describe('PATCH /api/backoffice/shifts/:id (BUG-17)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.shift.findUnique.mockResolvedValue({
      id: 1,
      name: 'Comida',
      startTime: '13:00',
      endTime: '16:00',
      slotInterval: 30,
      daysOfWeek: [2, 3, 4, 5, 6],
      isActive: true
    });
    prisma.shift.update.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
  });

  it('rechaza slotInterval = 0 con 400', async () => {
    const res = await request(app)
      .patch('/api/backoffice/shifts/1')
      .set(auth)
      .send({ slotInterval: 0 });
    expect(res.status).toBe(400);
    expect(prisma.shift.update).not.toHaveBeenCalled();
  });

  it('rechaza slotInterval negativo con 400', async () => {
    const res = await request(app)
      .patch('/api/backoffice/shifts/1')
      .set(auth)
      .send({ slotInterval: -30 });
    expect(res.status).toBe(400);
  });

  it('rechaza startTime con formato inválido', async () => {
    const res = await request(app)
      .patch('/api/backoffice/shifts/1')
      .set(auth)
      .send({ startTime: '25:99' });
    expect(res.status).toBe(400);
  });

  it('rechaza startTime >= endTime (efectivos)', async () => {
    const res = await request(app)
      .patch('/api/backoffice/shifts/1')
      .set(auth)
      .send({ startTime: '18:00', endTime: '16:00' });
    expect(res.status).toBe(400);
  });

  it('rechaza daysOfWeek con valores fuera de 0-6', async () => {
    const res = await request(app)
      .patch('/api/backoffice/shifts/1')
      .set(auth)
      .send({ daysOfWeek: [1, 7] });
    expect(res.status).toBe(400);
  });

  it('rechaza daysOfWeek que no sea array', async () => {
    const res = await request(app)
      .patch('/api/backoffice/shifts/1')
      .set(auth)
      .send({ daysOfWeek: 'lunes' });
    expect(res.status).toBe(400);
  });

  it('acepta una actualización válida', async () => {
    const res = await request(app)
      .patch('/api/backoffice/shifts/1')
      .set(auth)
      .send({ slotInterval: 15, startTime: '13:30', endTime: '16:30', daysOfWeek: [0, 2, 3] });
    expect(res.status).toBe(200);
    expect(prisma.shift.update).toHaveBeenCalled();
  });
});
