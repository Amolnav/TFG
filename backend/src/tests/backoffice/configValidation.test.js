import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
const prisma = require('../../config/database');
const { JWT_SECRET } = require('../../config/auth');

const token = jwt.sign({ id: 'test', email: 'test@test.com', name: 'Test', role: 'ADMIN' }, JWT_SECRET);
const auth = { Authorization: `Bearer ${token}` };

// BUG-05 + M1: PATCH /backoffice/config valida contra la whitelist tipada de
// configSchema; una clave desconocida o un valor con forma inválida se
// rechazan con 400 sin tocar la BD.
describe('PATCH /api/backoffice/config (BUG-05 / M1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.systemConfig.upsert.mockResolvedValue({});
    prisma.systemConfig.findMany.mockResolvedValue([]);
    prisma.table.findMany.mockResolvedValue([]);
  });

  it('rechaza claves desconocidas con 400', async () => {
    const res = await request(app)
      .patch('/api/backoffice/config')
      .set(auth)
      .send({ clave_maliciosa: 'x' });
    expect(res.status).toBe(400);
    expect(prisma.systemConfig.upsert).not.toHaveBeenCalled();
  });

  it('rechaza restaurant_name vacío con 400', async () => {
    const res = await request(app)
      .patch('/api/backoffice/config')
      .set(auth)
      .send({ restaurant_name: '' });
    expect(res.status).toBe(400);
    expect(prisma.systemConfig.upsert).not.toHaveBeenCalled();
  });

  it('rechaza un color de tema que no es hex', async () => {
    const res = await request(app)
      .patch('/api/backoffice/config')
      .set(auth)
      .send({ theme_primary: 'rojo' });
    expect(res.status).toBe(400);
  });

  it('rechaza una zona horaria inexistente', async () => {
    const res = await request(app)
      .patch('/api/backoffice/config')
      .set(auth)
      .send({ timezone: 'Marte/CráterFalso' });
    expect(res.status).toBe(400);
  });

  it('rechaza booking_durations sin tramo comodín (maxPax null)', async () => {
    const res = await request(app)
      .patch('/api/backoffice/config')
      .set(auth)
      .send({ booking_durations: JSON.stringify([{ maxPax: 2, minutes: 60 }]) });
    expect(res.status).toBe(400);
  });

  it('rechaza specialties_config con JSON inválido', async () => {
    const res = await request(app)
      .patch('/api/backoffice/config')
      .set(auth)
      .send({ specialties_config: '{esto no es json' });
    expect(res.status).toBe(400);
  });

  it('rechaza specialties_config con forma incorrecta', async () => {
    const res = await request(app)
      .patch('/api/backoffice/config')
      .set(auth)
      .send({ specialties_config: JSON.stringify({ title: 'sin idiomas', items: [] }) });
    expect(res.status).toBe(400);
  });

  it('acepta claves válidas y las persiste', async () => {
    const res = await request(app)
      .patch('/api/backoffice/config')
      .set(auth)
      .send({
        restaurant_name: 'Bar Ejemplo',
        restaurant_tagline: 'Tapas de barrio',
        theme_primary: '#14532D',
        currency: 'EUR',
        booking_min_hours_ahead: '1'
      });
    expect(res.status).toBe(200);
    expect(prisma.systemConfig.upsert).toHaveBeenCalledTimes(5);
  });

  it('acepta N especialidades (no solo 3)', async () => {
    const item = (id) => ({
      id,
      name: { es: `Plato ${id}` },
      description: { es: `Descripción ${id}` },
      image: `/branding/dish${id}.svg`
    });
    const res = await request(app)
      .patch('/api/backoffice/config')
      .set(auth)
      .send({
        specialties_config: JSON.stringify({
          title: { es: 'Especialidades' },
          items: [1, 2, 3, 4, 5].map(item)
        })
      });
    expect(res.status).toBe(200);
  });

  it('sigue ignorando en silencio las claves dinámicas calculadas', async () => {
    const res = await request(app)
      .patch('/api/backoffice/config')
      .set(auth)
      .send({ dynamic_max_capacity: '99', restaurant_name: 'Bar Ejemplo' });
    expect(res.status).toBe(200);
    expect(prisma.systemConfig.upsert).toHaveBeenCalledTimes(1);
  });
});
