import { describe, it, expect, vi } from 'vitest';
const { errorHandler } = require('../middleware/errorHandler');

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

// BUG-15/T2: bajo concurrencia, la violación del constraint de exclusión
// booking_no_table_overlap (SQLSTATE 23P01) debe responder 409, no 500.
describe('errorHandler — constraint de exclusión (BUG-15)', () => {
  it('mapea un error 23P01 a 409 TABLE_OCCUPIED', () => {
    const err = new Error(
      'db error: ERROR: conflicting key value violates exclusion constraint "booking_no_table_overlap" (SQLSTATE 23P01)'
    );
    const res = mockRes();

    errorHandler(err, { path: '/api/public/reservations', method: 'POST', body: {} }, res, () => {});

    expect(res.status).toHaveBeenCalledWith(409);
    const payload = res.json.mock.calls[0][0];
    expect(payload.type).toBe('TABLE_OCCUPIED');
  });

  it('no loguea contraseñas en el cuerpo (BUG-06)', () => {
    // N4.3: el errorHandler escribe por el logger estructurado, no por console
    const { logger } = require('../config/logger');
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const res = mockRes();

    errorHandler(
      new Error('fallo'),
      { path: '/api/auth/login', method: 'POST', body: { email: 'a@a.com', password: 'super-secreta' } },
      res,
      () => {}
    );

    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain('super-secreta');
    expect(logged).toContain('[REDACTED]');
    spy.mockRestore();
  });
});
