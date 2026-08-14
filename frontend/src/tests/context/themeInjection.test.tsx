import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigProvider } from '../../context/ConfigContext';
import { DEFAULT_PUBLIC_CONFIG } from '../../constants/publicConfig';
import { getPublicFrontendConfig } from '../../services/api';

vi.mock('../../services/api', () => ({
  getPublicFrontendConfig: vi.fn(),
}));

// M3: cambiar las claves de color/fuente en config re-tematiza la aplicación
// mediante un bloque :root inyectado; el título del documento refleja la marca.
describe('ConfigProvider — inyección de tema (M3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.getElementById('brand-theme')?.remove();
    document.getElementById('brand-fonts')?.remove();
  });

  it('inyecta los tokens de marca y actualiza el <title>', async () => {
    vi.mocked(getPublicFrontendConfig).mockResolvedValue({
      ...DEFAULT_PUBLIC_CONFIG,
      restaurant_name: 'Bar Demo',
      restaurant_tagline: 'Tapas',
      theme_primary: '#14532D',
      theme_accent: '#EA580C',
      font_heading: 'Georgia, serif',
      fonts_url: '',
    });

    render(<ConfigProvider><div /></ConfigProvider>);

    await waitFor(() => {
      const style = document.getElementById('brand-theme');
      expect(style).toBeTruthy();
      expect(style!.textContent).toContain('--primary: #14532D');
      expect(style!.textContent).toContain('--accent-action: #EA580C');
      expect(style!.textContent).toContain('--font-heading: Georgia, serif');
      expect(document.title).toBe('Bar Demo — Tapas');
    });

    // fonts_url vacío → sin <link> de fuentes externas
    expect(document.getElementById('brand-fonts')).toBeNull();
  });

  it('con fonts_url configurada añade la hoja de fuentes', async () => {
    vi.mocked(getPublicFrontendConfig).mockResolvedValue({
      ...DEFAULT_PUBLIC_CONFIG,
      fonts_url: 'https://fonts.example.com/css',
    });

    render(<ConfigProvider><div /></ConfigProvider>);

    await waitFor(() => {
      const link = document.getElementById('brand-fonts') as HTMLLinkElement | null;
      expect(link).toBeTruthy();
      expect(link!.href).toBe('https://fonts.example.com/css');
    });
  });

  it('el tema de marca solo aplica al modo claro (no pisa el modo oscuro)', async () => {
    vi.mocked(getPublicFrontendConfig).mockResolvedValue({
      ...DEFAULT_PUBLIC_CONFIG,
      theme_primary: '#14532D',
    });

    render(<ConfigProvider><div /></ConfigProvider>);

    await waitFor(() => {
      const style = document.getElementById('brand-theme');
      expect(style!.textContent).toContain(":root:not([data-theme='dark'])");
    });
  });
});

// N3.5/N4.6: SEO y branding PWA dinámicos desde la configuración
describe('ConfigProvider — SEO y PWA (N3.5/N4.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.getElementById('seo-jsonld')?.remove();
    document.querySelectorAll('[data-seo-hreflang]').forEach((el) => el.remove());
  });

  it('inyecta description, OG, JSON-LD de Restaurant y hreflang', async () => {
    vi.mocked(getPublicFrontendConfig).mockResolvedValue({
      ...DEFAULT_PUBLIC_CONFIG,
      restaurant_name: 'Bar Demo',
      restaurant_tagline: 'Tapas',
      restaurant_phone: '900 111 222',
      languages_supported: 'es,en',
      schedule: {
        openingDays: [2, 3],
        shifts: [{ name: 'Continuo', startTime: '12:00', endTime: '23:00', daysOfWeek: [2, 3] }],
      },
    });

    render(<ConfigProvider><div /></ConfigProvider>);

    await waitFor(() => {
      const description = document.querySelector("meta[name='description']");
      expect(description?.getAttribute('content')).toBe('Bar Demo — Tapas');

      const ogTitle = document.querySelector("meta[property='og:title']");
      expect(ogTitle?.getAttribute('content')).toBe('Bar Demo — Tapas');

      const jsonLd = JSON.parse(document.getElementById('seo-jsonld')!.textContent || '{}');
      expect(jsonLd['@type']).toBe('Restaurant');
      expect(jsonLd.acceptsReservations).toBe('True');
      expect(jsonLd.telephone).toBe('900 111 222');
      expect(jsonLd.openingHoursSpecification[0]).toMatchObject({
        opens: '12:00',
        closes: '23:00',
        dayOfWeek: ['Tuesday', 'Wednesday'],
      });

      const hreflangs = [...document.querySelectorAll('[data-seo-hreflang]')].map((el) =>
        el.getAttribute('hreflang')
      );
      expect(hreflangs).toEqual(expect.arrayContaining(['es', 'en', 'x-default']));
    });
  });

  it('el favicon y el manifest reflejan la marca (N4.6)', async () => {
    document.head.insertAdjacentHTML(
      'beforeend',
      "<link rel='icon' href='/favicon.svg'><link rel='manifest' href='/manifest.webmanifest'><meta name='theme-color' content='#000'>"
    );
    vi.mocked(getPublicFrontendConfig).mockResolvedValue({
      ...DEFAULT_PUBLIC_CONFIG,
      restaurant_name: 'Bar Demo',
      brand_logo: '🫒',
      theme_primary: '#14532D',
    });

    render(<ConfigProvider><div /></ConfigProvider>);

    await waitFor(() => {
      const favicon = document.querySelector<HTMLLinkElement>("link[rel='icon']");
      expect(favicon?.href).toContain('data:image/svg+xml');
      const manifest = document.querySelector<HTMLLinkElement>("link[rel='manifest']");
      expect(manifest?.href).toContain('data:application/manifest+json');
      expect(decodeURIComponent(manifest?.href || '')).toContain('Bar Demo');
      const themeColor = document.querySelector<HTMLMetaElement>("meta[name='theme-color']");
      expect(themeColor?.content).toBe('#14532D');
    });
  });
});
