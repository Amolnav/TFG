import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index';
const prisma = require('../config/database');

// N3.5: sitemap generado desde la configuración (idiomas activos) y la URL
// pública del despliegue (FRONTEND_URL).
describe('GET /sitemap.xml (N3.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.systemConfig.findMany.mockResolvedValue([]);
  });

  it('genera un XML válido con las rutas públicas y alternates hreflang', async () => {
    const res = await request(app).get('/sitemap.xml');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/xml');
    expect(res.text).toContain('<urlset');
    for (const route of ['/reservar', '/carta', '/historia']) {
      expect(res.text).toContain(`<loc>http://localhost:5173${route}</loc>`);
    }
    // Con el default es,en,fr hay alternates hreflang por idioma
    expect(res.text).toContain('hreflang="es"');
    expect(res.text).toContain('hreflang="en"');
    expect(res.text).toContain('hreflang="fr"');
    expect(res.text).toContain('?lng=en');
  });

  it('con un solo idioma no emite alternates', async () => {
    prisma.systemConfig.findMany.mockResolvedValue([
      { key: 'languages_supported', value: 'es' }
    ]);

    const res = await request(app).get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('hreflang');
  });
});
