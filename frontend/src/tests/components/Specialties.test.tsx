import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import Specialties from '../../components/Specialties';
import { getPublicFrontendConfig } from '../../services/api';
import { ConfigProvider } from '../../context/ConfigContext';
import { DEFAULT_PUBLIC_CONFIG } from '../../constants/publicConfig';

vi.mock('../../services/useReveal', () => ({
  useReveal: () => ({ current: null })
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const keys: Record<string, string> = {
        'specialties.viewFullMenu': 'Ver Carta Completa',
      };
      return keys[key] || key;
    },
    i18n: { language: 'es', changeLanguage: () => new Promise(() => {}), options: {} }
  })
}));

vi.mock('../../services/api', () => ({
  getPublicFrontendConfig: vi.fn(),
}));

// M2: fixtures NEUTROS y N platos (aquí 2, no un "3" fijo)
const TEST_CONFIG = {
  ...DEFAULT_PUBLIC_CONFIG,
  restaurant_name: 'Bar Demo',
  specialties: {
    title: { es: 'Los imprescindibles', en: 'The essentials', fr: 'Les incontournables' },
    items: [
      { id: 1, name: { es: 'Plato Uno' }, description: { es: 'desc 1' }, image: '/branding/dish1.svg' },
      { id: 2, name: { es: 'Plato Dos' }, description: { es: 'desc 2' }, image: '/branding/dish2.svg' },
    ],
  },
};

describe('Specialties Component', () => {
  it('renders the section title and N specialty cards', async () => {
    vi.mocked(getPublicFrontendConfig).mockResolvedValue(TEST_CONFIG);

    render(
      <ConfigProvider>
        <BrowserRouter>
          <Specialties />
        </BrowserRouter>
      </ConfigProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Los imprescindibles')).toBeInTheDocument();
      expect(screen.getByText('Plato Uno')).toBeInTheDocument();
      expect(screen.getByText('Plato Dos')).toBeInTheDocument();
    });
  });

  it('contains a link to the menu page', async () => {
    vi.mocked(getPublicFrontendConfig).mockResolvedValue(TEST_CONFIG);
    render(
      <ConfigProvider>
        <BrowserRouter>
          <Specialties />
        </BrowserRouter>
      </ConfigProvider>
    );

    const link = await screen.findByRole('link', { name: /ver carta completa/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/carta');
  });

  it('sin especialidades configuradas la sección no se muestra', async () => {
    vi.mocked(getPublicFrontendConfig).mockResolvedValue({
      ...DEFAULT_PUBLIC_CONFIG,
      specialties: { title: { es: 'Especialidades' }, items: [] },
    });

    const { container } = render(
      <ConfigProvider>
        <BrowserRouter>
          <Specialties />
        </BrowserRouter>
      </ConfigProvider>
    );

    await waitFor(() => {
      expect(container.querySelector('.specialties')).toBeNull();
    });
  });
});
