import { describe, it, expect, vi, afterEach } from 'vitest';

// BUG-02: auth.js caía en silencio al secreto público 'changeme-secret-key'
// también en producción → tokens de ADMIN forjables.
describe('config/auth (BUG-02: fail-fast sin JWT_SECRET en producción)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('lanza un error al cargar en producción sin JWT_SECRET', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', '');
    vi.resetModules();

    await expect(import('../../config/auth')).rejects.toThrow(/JWT_SECRET/);
  });

  it('usa el fallback de desarrollo fuera de producción', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('JWT_SECRET', '');
    vi.resetModules();

    const mod = await import('../../config/auth');
    const cfg = mod.default ?? mod;
    expect(cfg.JWT_SECRET).toBeTruthy();
  });

  it('en producción con JWT_SECRET definido carga sin error', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'un-secreto-de-verdad');
    vi.resetModules();

    const mod = await import('../../config/auth');
    const cfg = mod.default ?? mod;
    expect(cfg.JWT_SECRET).toBe('un-secreto-de-verdad');
  });
});

// BUG-04: el motor de fechas depende de la TZ del proceso pero nada
// comprobaba ni avisaba de su ausencia al arrancar.
describe('config/timezone (BUG-04: check de TZ al arrancar)', () => {
  it('avisa cuando TZ no está definida', () => {
    const { checkTimezone } = require('../../config/timezone');
    const result = checkTimezone({});
    expect(result.ok).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('acepta cuando TZ está definida', () => {
    const { checkTimezone } = require('../../config/timezone');
    const result = checkTimezone({ TZ: 'Europe/Madrid' });
    expect(result.ok).toBe(true);
    expect(result.timezone).toBe('Europe/Madrid');
  });
});
