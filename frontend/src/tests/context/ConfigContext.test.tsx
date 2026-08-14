import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigProvider } from '../../context/ConfigContext';
import { useConfig } from '../../context/useConfig';
import { DEFAULT_PUBLIC_CONFIG } from '../../constants/publicConfig';
import * as api from '../../services/api';
import type { PublicFrontendConfig } from '../../types';

vi.mock('../../services/api', () => ({
  getPublicFrontendConfig: vi.fn(),
}));

function Consumer() {
  const { config, loading } = useConfig();
  return (
    <div>
      <span data-testid="name">{config.restaurant_name}</span>
      <span data-testid="phone">{config.restaurant_phone}</span>
      <span data-testid="loading">{String(loading)}</span>
    </div>
  );
}

// BUG-45: un campo null del backend no debe sobrescribir el default (el
// Navbar hace config.restaurant_phone.replace(...) y reventaba en blanco).
describe('ConfigContext (BUG-45)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('los campos null del backend no pisan los defaults', async () => {
    vi.mocked(api.getPublicFrontendConfig).mockResolvedValue({
      restaurant_name: 'Bar Ejemplo',
      restaurant_phone: null,
    } as unknown as PublicFrontendConfig);

    render(
      <ConfigProvider>
        <Consumer />
      </ConfigProvider>
    );

    expect(await screen.findByText('Bar Ejemplo')).toBeInTheDocument();
    expect(screen.getByTestId('phone').textContent).toBe(DEFAULT_PUBLIC_CONFIG.restaurant_phone);
  });

  it('si la API falla se mantienen los defaults y loading termina', async () => {
    vi.mocked(api.getPublicFrontendConfig).mockRejectedValue(new Error('network'));

    render(
      <ConfigProvider>
        <Consumer />
      </ConfigProvider>
    );

    expect(await screen.findByText('false', { selector: '[data-testid="loading"]' })).toBeInTheDocument();
    expect(screen.getByTestId('name').textContent).toBe(DEFAULT_PUBLIC_CONFIG.restaurant_name);
  });
});
