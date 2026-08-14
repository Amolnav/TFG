import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { getDashboard, getPublicFrontendConfig } from '../../services/api';

function makeToken(expOffsetSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expOffsetSeconds }));
  return `header.${payload}.signature`;
}

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// BUG-40: el interceptor de 401 expulsaba al login en TODAS las peticiones,
// incluidas las públicas; ahora solo actúa sobre el área privada.
describe('services/api — manejo de 401 (BUG-40)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('un 401 en una petición del backoffice limpia la sesión', async () => {
    localStorage.setItem('admin_token', makeToken(3600));
    server.use(
      http.get('*/api/backoffice/dashboard', () => new HttpResponse(null, { status: 401 }))
    );

    await expect(getDashboard()).rejects.toThrow();
    expect(localStorage.getItem('admin_token')).toBeNull();
  });

  it('un 401 en una petición pública NO toca la sesión', async () => {
    localStorage.setItem('admin_token', makeToken(3600));
    server.use(
      http.get('*/api/public/config', () => new HttpResponse(null, { status: 401 }))
    );

    await expect(getPublicFrontendConfig()).rejects.toThrow();
    expect(localStorage.getItem('admin_token')).toBe(localStorage.getItem('admin_token'));
    expect(localStorage.getItem('admin_token')).not.toBeNull();
  });

  it('las respuestas correctas se entregan con su payload', async () => {
    server.use(
      http.get('*/api/public/config', () =>
        HttpResponse.json({ status: 'success', data: { restaurant_name: 'Bar Ejemplo' } })
      )
    );

    const config = await getPublicFrontendConfig();
    expect(config.restaurant_name).toBe('Bar Ejemplo');
  });

  it('adjunta el token en las peticiones cuando existe', async () => {
    localStorage.setItem('admin_token', makeToken(3600));
    let authHeader: string | null = null;
    server.use(
      http.get('*/api/backoffice/dashboard', ({ request }) => {
        authHeader = request.headers.get('authorization');
        return HttpResponse.json({ status: 'success', data: { summary: {}, bookings: [] } });
      })
    );

    await getDashboard();
    expect(authHeader).toContain('Bearer ');
  });
});
