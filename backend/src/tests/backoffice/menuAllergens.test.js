import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
const prisma = require('../../config/database');
const { JWT_SECRET } = require('../../config/auth');
const { EU_ALLERGENS } = require('../../config/constants');

const token = jwt.sign({ id: 'test', email: 'test@test.com', name: 'Test', role: 'STAFF' }, JWT_SECRET);
const auth = { Authorization: `Bearer ${token}` };

// N3.3: alérgenos UE y foto por plato (migración aditiva de MenuItem).
describe('alérgenos y foto por plato (N3.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.staff.findUnique.mockResolvedValue({ id: 'test', email: 'test@test.com', name: 'Test', role: 'STAFF', isActive: true });
    prisma.menuItem.create.mockImplementation(async ({ data }) => ({ id: 9, ...data }));
    prisma.menuItem.update.mockImplementation(async ({ data }) => ({ id: 9, ...data }));
  });

  it('la lista de alérgenos son los 14 obligatorios de la UE', () => {
    expect(EU_ALLERGENS).toHaveLength(14);
    expect(EU_ALLERGENS).toEqual(expect.arrayContaining(['gluten', 'crustaceos', 'lacteos', 'sulfitos', 'moluscos']));
  });

  it('crea un plato con alérgenos válidos y foto', async () => {
    const res = await request(app)
      .post('/api/backoffice/menu/items')
      .set(auth)
      .send({
        name: 'Tortilla',
        price: '12',
        categoryId: 1,
        allergens: ['huevos', 'lacteos', 'huevos'],
        photoUrl: '/branding/dish1.svg'
      });

    expect(res.status).toBe(201);
    const data = prisma.menuItem.create.mock.calls[0][0].data;
    expect(data.allergens).toEqual(['huevos', 'lacteos']); // deduplicados
    expect(data.photoUrl).toBe('/branding/dish1.svg');
  });

  it('rechaza alérgenos fuera de la lista UE (400)', async () => {
    const res = await request(app)
      .post('/api/backoffice/menu/items')
      .set(auth)
      .send({ name: 'Plato', price: '5', categoryId: 1, allergens: ['gluten', 'kriptonita'] });

    expect(res.status).toBe(400);
    expect(res.body.message || JSON.stringify(res.body)).toContain('kriptonita');
    expect(prisma.menuItem.create).not.toHaveBeenCalled();
  });

  it('rechaza una photoUrl que no sea URL o ruta local (400)', async () => {
    const res = await request(app)
      .post('/api/backoffice/menu/items')
      .set(auth)
      .send({ name: 'Plato', price: '5', categoryId: 1, photoUrl: 'javascript:alert(1)' });

    expect(res.status).toBe(400);
    expect(prisma.menuItem.create).not.toHaveBeenCalled();
  });

  it('el update permite limpiar la foto (photoUrl: null → null en BD)', async () => {
    const res = await request(app)
      .put('/api/backoffice/menu/items/9')
      .set(auth)
      .send({ photoUrl: '' });

    expect(res.status).toBe(200);
    expect(prisma.menuItem.update.mock.calls[0][0].data.photoUrl).toBe(null);
  });

  it('la carta pública incluye allergens y photoUrl', async () => {
    prisma.menuCategory.findMany.mockResolvedValue([
      {
        id: 1,
        name: 'Tapas',
        isActive: true,
        items: [
          { id: 9, name: 'Tortilla', price: '12', isActive: true, allergens: ['huevos'], photoUrl: '/branding/dish1.svg' }
        ]
      }
    ]);

    const res = await request(app).get('/api/public/menu');
    expect(res.status).toBe(200);
    const item = res.body.data.categories[0].items[0];
    expect(item.allergens).toEqual(['huevos']);
    expect(item.photoUrl).toBe('/branding/dish1.svg');
  });
});
