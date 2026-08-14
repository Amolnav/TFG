// BUG-38: utilidades de sesión centralizadas. El token se valida por su
// expiración (decodificación local del JWT, sin verificar firma: la firma
// la verifica siempre el backend; esto es solo para UX temprana).

const TOKEN_KEY = 'admin_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export interface SessionPayload {
  exp?: number;
  id?: string;
  email?: string;
  name?: string;
  role?: 'ADMIN' | 'STAFF';
}

export function decodeTokenPayload(token: string): SessionPayload | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as SessionPayload;
  } catch {
    return null;
  }
}

// N2.1: el rol viaja en el payload del JWT; solo se usa para UX (mostrar u
// ocultar secciones). La autorización real la aplica siempre el backend.
export function getSessionUser(): SessionPayload | null {
  const token = getToken();
  if (!isTokenValid(token)) return null;
  return decodeTokenPayload(token as string);
}

export function getSessionRole(): 'ADMIN' | 'STAFF' | null {
  return getSessionUser()?.role ?? null;
}

export function isTokenValid(token: string | null): boolean {
  if (!token) return false;
  const payload = decodeTokenPayload(token);
  if (!payload || typeof payload.exp !== 'number') return false;
  return payload.exp * 1000 > Date.now();
}

export function hasValidSession(): boolean {
  return isTokenValid(getToken());
}
