import { describe, it, expect, beforeEach } from 'vitest';
import { isTokenValid, getToken, setToken, clearToken } from '../../utils/session';

function makeToken(expOffsetSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expOffsetSeconds }));
  return `header.${payload}.signature`;
}

// BUG-38: la sesión se valida por la expiración del JWT, no por la mera
// existencia de una cadena en localStorage.
describe('utils/session (BUG-38)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('un token con exp futuro es válido', () => {
    expect(isTokenValid(makeToken(3600))).toBe(true);
  });

  it('un token caducado no es válido', () => {
    expect(isTokenValid(makeToken(-60))).toBe(false);
  });

  it('una cadena arbitraria no es válida', () => {
    expect(isTokenValid('cualquier-cosa')).toBe(false);
  });

  it('un token sin exp no es válido', () => {
    const payload = btoa(JSON.stringify({ id: 'x' }));
    expect(isTokenValid(`h.${payload}.s`)).toBe(false);
  });

  it('null no es válido', () => {
    expect(isTokenValid(null)).toBe(false);
  });

  it('set/get/clear funcionan sobre localStorage', () => {
    setToken('abc');
    expect(getToken()).toBe('abc');
    clearToken();
    expect(getToken()).toBeNull();
  });
});
