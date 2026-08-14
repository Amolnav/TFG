import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Navbar from '../../components/Navbar';
import { ConfigProvider } from '../../context/ConfigContext';
import { DEFAULT_PUBLIC_CONFIG } from '../../constants/publicConfig';
import { getPublicFrontendConfig } from '../../services/api';

vi.mock('../../services/api', () => ({
  getPublicFrontendConfig: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const keys: Record<string, string> = {
        'navbar.home': 'Inicio',
        'navbar.menu': 'Carta',
        'navbar.history': 'Nuestra Historia',
        'navbar.bookTable': 'Reservar una Mesa',
        'navbar.reservations': 'Reservas',
        'navbar.toggleMenu': 'Abrir o cerrar el menú',
      };
      return keys[key] || key;
    },
    i18n: {
      changeLanguage: () => new Promise(() => {}),
      language: 'es',
      options: {},
    },
  }),
}));

// M2: fixture NEUTRO — los tests no asertan la marca de ningún cliente real
const TEST_CONFIG = {
  ...DEFAULT_PUBLIC_CONFIG,
  restaurant_name: 'Bar Demo',
  restaurant_tagline: 'Cocina de mercado',
  restaurant_phone: '900 111 222',
  brand_logo: '🥘',
};

describe('Navbar Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPublicFrontendConfig).mockResolvedValue(TEST_CONFIG);
  });

  it('renderiza la marca configurada (logo + nombre + eslogan)', async () => {
    render(
      <ConfigProvider>
        <BrowserRouter>
          <Navbar />
        </BrowserRouter>
      </ConfigProvider>
    );

    expect(await screen.findByText(/Bar Demo/)).toBeInTheDocument();
    expect(screen.getByText('🥘')).toBeInTheDocument();
    expect(screen.getByText('Cocina de mercado')).toBeInTheDocument();

    // Debería haber 2 links a "Carta" (Desktop y Mobile)
    const cartaLinks = screen.getAllByRole('link', { name: /carta/i });
    expect(cartaLinks.length).toBe(2);
  });

  it('sin configurar muestra el default neutro "Mi Restaurante"', async () => {
    vi.mocked(getPublicFrontendConfig).mockRejectedValue(new Error('network'));
    render(
      <ConfigProvider>
        <BrowserRouter>
          <Navbar />
        </BrowserRouter>
      </ConfigProvider>
    );

    expect(await screen.findByText(/Mi Restaurante/)).toBeInTheDocument();
  });

  it('hides nav links when showLinks is false', () => {
    render(
      <ConfigProvider>
        <BrowserRouter>
          <Navbar showLinks={false} />
        </BrowserRouter>
      </ConfigProvider>
    );

    expect(screen.queryByText('Inicio')).not.toBeInTheDocument();
  });

  it('shows phone info when isReservation is true', async () => {
    render(
      <ConfigProvider>
        <BrowserRouter>
          <Navbar isReservation={true} />
        </BrowserRouter>
      </ConfigProvider>
    );

    expect(await screen.findByText(/900 111 222/)).toBeInTheDocument();
    expect(screen.queryByText('Reservar una Mesa')).not.toBeInTheDocument();
  });
});
