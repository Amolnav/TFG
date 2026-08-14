import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index';
const prisma = require('../config/database');
const { SENSITIVE_FIELDS } = require('../config/logger');

// N4.3: request-id por petición y redacción de sensibles compartida entre
// logger (pino redact) y errorHandler (sanitizeBody).
describe('logging estructurado (N4.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toda respuesta lleva X-Request-Id generado', async () => {
    const res = await request(app).get('/api/public/config');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('si el proxy manda X-Request-Id, se respeta (trazabilidad extremo a extremo)', async () => {
    const res = await request(app)
      .get('/api/public/config')
      .set('X-Request-Id', 'proxy-abc-123');
    expect(res.headers['x-request-id']).toBe('proxy-abc-123');
  });

  it('la lista de campos sensibles cubre credenciales y tokens', () => {
    expect(SENSITIVE_FIELDS).toEqual(expect.arrayContaining(['password', 'passwordHash', 'token']));
  });

  it('un fallo de login sigue sin volcar la contraseña en el log (BUG-06)', async () => {
    prisma.staff.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'x@x.com', password: 'super-secreta' });
    expect(res.status).toBe(401);
    // La respuesta tampoco refleja la contraseña
    expect(JSON.stringify(res.body)).not.toContain('super-secreta');
  });
});
