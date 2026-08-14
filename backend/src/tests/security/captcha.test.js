import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../index';
const prisma = require('../../config/database');
const captcha = require('../../middleware/captcha');

// N4.1: Cloudflare Turnstile en la creación pública de reservas. Desactivado
// por defecto; se activa con captcha_enabled=true + captcha_secret_key. La
// llamada HTTP real (turnstileRequest) se espía: los tests no tocan la red.

function mockConfig(rows) {
  prisma.systemConfig.findMany.mockResolvedValue(
    Object.entries(rows).map(([key, value]) => ({ key, value }))
  );
}

const CAPTCHA_ON = { captcha_enabled: 'true', captcha_secret_key: 'sk-test' };

describe('captcha Turnstile (N4.1)', () => {
  let verifySpy;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockConfig({});
    verifySpy = vi.spyOn(captcha, 'turnstileRequest');
  });

  it('desactivado por defecto: la reserva llega al controller sin token', async () => {
    const res = await request(app).post('/api/public/reservations').send({});
    // Sin captcha el flujo sigue: falla la validación de datos, no el captcha
    expect(res.status).toBe(400);
    expect(res.body.type).toBe('VALIDATION_ERROR');
    expect(verifySpy).not.toHaveBeenCalled();
  });

  it('activado: sin captchaToken responde 400 CAPTCHA_REQUIRED', async () => {
    mockConfig(CAPTCHA_ON);
    const res = await request(app).post('/api/public/reservations').send({});
    expect(res.status).toBe(400);
    expect(res.body.type).toBe('CAPTCHA_REQUIRED');
    expect(verifySpy).not.toHaveBeenCalled();
  });

  it('activado: un token rechazado por Turnstile responde 403 CAPTCHA_INVALID', async () => {
    mockConfig(CAPTCHA_ON);
    verifySpy.mockResolvedValue({ success: false, 'error-codes': ['invalid-input-response'] });
    const res = await request(app)
      .post('/api/public/reservations')
      .send({ captchaToken: 'tok-malo' });
    expect(res.status).toBe(403);
    expect(res.body.type).toBe('CAPTCHA_INVALID');
  });

  it('activado: un token válido deja pasar la petición al controller', async () => {
    mockConfig(CAPTCHA_ON);
    verifySpy.mockResolvedValue({ success: true });
    const res = await request(app)
      .post('/api/public/reservations')
      .send({ captchaToken: 'tok-bueno' });
    expect(verifySpy).toHaveBeenCalledWith('sk-test', 'tok-bueno', expect.anything());
    // Pasa el captcha y falla después la validación de datos de la reserva
    expect(res.status).toBe(400);
    expect(res.body.type).toBe('VALIDATION_ERROR');
  });

  it('si Turnstile no responde, la reserva no se bloquea (fail-open)', async () => {
    mockConfig(CAPTCHA_ON);
    verifySpy.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await request(app)
      .post('/api/public/reservations')
      .send({ captchaToken: 'tok-cualquiera' });
    expect(res.status).toBe(400);
    expect(res.body.type).toBe('VALIDATION_ERROR');
  });
});
