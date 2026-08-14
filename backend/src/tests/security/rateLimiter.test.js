import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../../index';
const prisma = require('../../config/database');

// N4.1: rate limiting en la API pública y el login. En NODE_ENV=test los
// limitadores solo actúan sobre peticiones con la cabecera x-test-rate-limit
// (así el resto de la suite no consume cupo). Los límites salen de SystemConfig.
const LIMITED = { 'x-test-rate-limit': 'on' };

function mockConfig(rows) {
  prisma.systemConfig.findMany.mockResolvedValue(
    Object.entries(rows).map(([key, value]) => ({ key, value }))
  );
}

describe('rate limiting (N4.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.staff.findUnique.mockResolvedValue(null);
    prisma.shift.findMany.mockResolvedValue([]);
    mockConfig({});
  });

  it('sin la cabecera de test, las peticiones no se limitan en la suite', async () => {
    mockConfig({ rate_limit_public_per_minute: '1' });
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/api/public/config');
      expect(res.status).toBe(200);
    }
  });

  it('el login con credenciales correctas no consume cupo (skipSuccessfulRequests)', async () => {
    mockConfig({ rate_limit_login_per_15min: '2' });
    const passwordHash = bcrypt.hashSync('secret123', 4);
    prisma.staff.findUnique.mockResolvedValue({
      id: 'admin-1', email: 'ok@test.com', name: 'Admin', role: 'ADMIN', isActive: true, passwordHash
    });
    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .set(LIMITED)
        .send({ email: 'ok@test.com', password: 'secret123' });
      expect(res.status).toBe(200);
    }
  });

  it('los intentos de login fallidos se bloquean al superar el límite (429 RATE_LIMITED)', async () => {
    mockConfig({ rate_limit_login_per_15min: '2' });
    prisma.staff.findUnique.mockResolvedValue(null);

    const first = await request(app).post('/api/auth/login').set(LIMITED)
      .send({ email: 'atacante@test.com', password: 'mala' });
    expect(first.status).toBe(401);
    const second = await request(app).post('/api/auth/login').set(LIMITED)
      .send({ email: 'atacante@test.com', password: 'mala' });
    expect(second.status).toBe(401);

    const blocked = await request(app).post('/api/auth/login').set(LIMITED)
      .send({ email: 'atacante@test.com', password: 'mala' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.type).toBe('RATE_LIMITED');
  });

  it('la API pública se bloquea al superar el límite por minuto (429 RATE_LIMITED)', async () => {
    mockConfig({ rate_limit_public_per_minute: '3' });

    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/api/public/config').set(LIMITED);
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).get('/api/public/config').set(LIMITED);
    expect(blocked.status).toBe(429);
    expect(blocked.body.type).toBe('RATE_LIMITED');
  });
});
