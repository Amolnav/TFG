import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../../../components/admin/ProtectedRoute';

function makeToken(expOffsetSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expOffsetSeconds }));
  return `header.${payload}.signature`;
}

function renderProtected() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin/login" element={<div>PANTALLA LOGIN</div>} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <div>PANEL PRIVADO</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

// BUG-38: antes bastaba localStorage.setItem('admin_token', 'x') para
// renderizar todo el panel de administración.
describe('ProtectedRoute (BUG-38)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('sin token redirige al login', () => {
    renderProtected();
    expect(screen.getByText('PANTALLA LOGIN')).toBeInTheDocument();
    expect(screen.queryByText('PANEL PRIVADO')).not.toBeInTheDocument();
  });

  it('con una cadena arbitraria como token redirige al login y la limpia', () => {
    localStorage.setItem('admin_token', 'x');
    renderProtected();
    expect(screen.getByText('PANTALLA LOGIN')).toBeInTheDocument();
    expect(localStorage.getItem('admin_token')).toBeNull();
  });

  it('con un token caducado redirige al login', () => {
    localStorage.setItem('admin_token', makeToken(-60));
    renderProtected();
    expect(screen.getByText('PANTALLA LOGIN')).toBeInTheDocument();
    expect(localStorage.getItem('admin_token')).toBeNull();
  });

  it('con un token vigente renderiza el contenido protegido', () => {
    localStorage.setItem('admin_token', makeToken(3600));
    renderProtected();
    expect(screen.getByText('PANEL PRIVADO')).toBeInTheDocument();
  });
});
