import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
const prisma = require('../../config/database');
const { JWT_SECRET } = require('../../config/auth');

const token = jwt.sign({ id: 'test', email: 'test@test.com', name: 'Test', role: 'ADMIN' }, JWT_SECRET);
const auth = { Authorization: `Bearer ${token}` };

// BUG-31: las altas del back-office no validaban nada — un nombre ausente o
// un categoryId no numérico acababan en error de Prisma → 500 en vez de 400.
describe('validación de altas del back-office (BUG-31)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.zone.create.mockResolvedValue({ id: 1 });
    prisma.table.create.mockResolvedValue({ id: 1 });
    prisma.table.findUnique.mockResolvedValue(null);
    prisma.menuCategory.create.mockResolvedValue({ id: 1 });
    prisma.menuItem.create.mockResolvedValue({ id: 1 });
  });

  it('crear zona sin nombre → 400', async () => {
    const res = await request(app)
      .post('/api/backoffice/zones')
      .set(auth)
      .send({ description: 'sin nombre' });
    expect(res.status).toBe(400);
    expect(prisma.zone.create).not.toHaveBeenCalled();
  });

  it('crear mesa con minCapacity > maxCapacity → 400', async () => {
    const res = await request(app)
      .post('/api/backoffice/zones/1/tables')
      .set(auth)
      .send({ name: 'Mesa X', minCapacity: 8, maxCapacity: 2 });
    expect(res.status).toBe(400);
    expect(prisma.table.create).not.toHaveBeenCalled();
  });

  it('crear mesa sin nombre → 400', async () => {
    const res = await request(app)
      .post('/api/backoffice/zones/1/tables')
      .set(auth)
      .send({ minCapacity: 2, maxCapacity: 4 });
    expect(res.status).toBe(400);
  });

  it('crear categoría de menú sin nombre → 400', async () => {
    const res = await request(app)
      .post('/api/backoffice/menu/categories')
      .set(auth)
      .send({ description: 'x' });
    expect(res.status).toBe(400);
    expect(prisma.menuCategory.create).not.toHaveBeenCalled();
  });

  it('crear plato con categoryId no numérico → 400', async () => {
    const res = await request(app)
      .post('/api/backoffice/menu/items')
      .set(auth)
      .send({ name: 'Plato', price: '10€', categoryId: 'abc' });
    expect(res.status).toBe(400);
    expect(prisma.menuItem.create).not.toHaveBeenCalled();
  });

  it('un alta válida sigue funcionando (201)', async () => {
    const res = await request(app)
      .post('/api/backoffice/zones')
      .set(auth)
      .send({ name: 'Terraza' });
    expect(res.status).toBe(201);
  });
});
