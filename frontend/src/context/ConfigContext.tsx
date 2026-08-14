
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getPublicFrontendConfig } from '../services/api';
import { DEFAULT_PUBLIC_CONFIG } from '../constants/publicConfig';
import { ConfigContext } from './configContextImpl';
import { getBaseLanguage } from '../utils/i18n';
import type { PublicFrontendConfig } from '../types';

/**
 * M3: re-tematiza la aplicación desde la configuración inyectando un bloque
 * :root con los tokens de marca. Se limita al tema claro para no pisar la
 * paleta neutra del modo oscuro del panel (mismo selector, orden posterior).
 */
function applyBrandTheme(config: PublicFrontendConfig) {
  const styleId = 'brand-theme';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
:root:not([data-theme='dark']) {
  --primary: ${config.theme_primary};
  --primary-light: ${config.theme_primary_light};
  --text-dark: ${config.theme_primary};
  --accent-action: ${config.theme_accent};
  --accent-action-hover: ${config.theme_accent_hover};
  --accent-decor: ${config.theme_decor};
  --sidebar-bg: ${config.theme_primary};
}
:root {
  --font-heading: ${config.font_heading};
  --font-body: ${config.font_body};
}`;

  // Hoja de fuentes configurable (vacío = solo fuentes del sistema)
  const fontsId = 'brand-fonts';
  let fontsEl = document.getElementById(fontsId) as HTMLLinkElement | null;
  if (config.fonts_url) {
    if (!fontsEl) {
      fontsEl = document.createElement('link');
      fontsEl.id = fontsId;
      fontsEl.rel = 'stylesheet';
      document.head.appendChild(fontsEl);
    }
    if (fontsEl.href !== config.fonts_url) fontsEl.href = config.fonts_url;
  } else if (fontsEl) {
    fontsEl.remove();
  }
}

/**
 * N4.6: PWA — favicon, theme-color y manifest dinámicos con la marca del
 * restaurante, para que el panel instalado lleve su icono y su nombre.
 */
function isImageUrl(value: string) {
  return value.startsWith('/') || value.startsWith('http');
}

function emojiIconDataUrl(emoji: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="0.9em" font-size="90">${emoji}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function applyPwaBranding(config: PublicFrontendConfig) {
  const iconHref = isImageUrl(config.brand_logo)
    ? config.brand_logo
    : emojiIconDataUrl(config.brand_logo || '🍽️');

  // Favicon con la marca
  const favicon = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (favicon && favicon.href !== iconHref) favicon.href = iconHref;

  // Color de la barra del navegador/PWA
  const themeColor = document.querySelector<HTMLMetaElement>("meta[name='theme-color']");
  if (themeColor) themeColor.content = config.theme_primary;

  // Manifest dinámico: nombre e icono del restaurante (el estático
  // /manifest.webmanifest queda como fallback neutro)
  const manifest = {
    name: config.restaurant_name,
    short_name: config.restaurant_name.slice(0, 12),
    description: config.restaurant_tagline || 'Panel de gestión de reservas',
    start_url: '/admin',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: config.theme_primary,
    icons: [{ src: iconHref, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
  };
  const manifestLink = document.querySelector<HTMLLinkElement>("link[rel='manifest']");
  if (manifestLink) {
    manifestLink.href = `data:application/manifest+json,${encodeURIComponent(JSON.stringify(manifest))}`;
  }
}

/**
 * N3.5: SEO por restaurante — meta description/OG, datos estructurados
 * schema.org (Restaurant con horario derivado de los turnos reales) y
 * alternates hreflang para los idiomas activos. Todo desde la configuración.
 */
const SCHEMA_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}='${key}']`);
  if (!content) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function applySeo(config: PublicFrontendConfig) {
  const origin = window.location.origin;
  const title = document.title;
  const description = config.restaurant_tagline
    ? `${config.restaurant_name} — ${config.restaurant_tagline}`
    : config.restaurant_name;
  const image = config.hero?.image ? `${origin}${config.hero.image}` : '';

  upsertMeta('name', 'description', description);
  upsertMeta('property', 'og:title', title);
  upsertMeta('property', 'og:description', description);
  upsertMeta('property', 'og:site_name', config.restaurant_name);
  upsertMeta('property', 'og:type', 'restaurant');
  upsertMeta('property', 'og:url', origin + window.location.pathname);
  upsertMeta('property', 'og:image', image);

  // Datos estructurados schema.org (horario derivado de los Shift reales)
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: config.restaurant_name,
    url: origin,
    acceptsReservations: 'True',
    openingHoursSpecification: config.schedule.shifts.map((shift) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: shift.daysOfWeek.map((day) => SCHEMA_DAY_NAMES[day]).filter(Boolean),
      opens: shift.startTime,
      closes: shift.endTime,
    })),
  };
  if (config.restaurant_tagline) jsonLd.description = config.restaurant_tagline;
  if (config.restaurant_phone) jsonLd.telephone = config.restaurant_phone;
  if (config.restaurant_email) jsonLd.email = config.restaurant_email;
  if (config.restaurant_address) {
    jsonLd.address = { '@type': 'PostalAddress', streetAddress: config.restaurant_address };
  }
  if (image) jsonLd.image = image;
  if (config.maps_url) jsonLd.hasMap = config.maps_url;

  let script = document.getElementById('seo-jsonld') as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.id = 'seo-jsonld';
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(jsonLd);

  // hreflang para los idiomas activos (la SPA cambia de idioma con ?lng=)
  document.querySelectorAll("link[data-seo-hreflang]").forEach((el) => el.remove());
  const languages = config.languages_supported.split(',').map((lang) => lang.trim()).filter(Boolean);
  if (languages.length > 1) {
    const path = window.location.pathname;
    for (const lang of languages) {
      const link = document.createElement('link');
      link.rel = 'alternate';
      link.hreflang = lang;
      link.href = `${origin}${path}?lng=${lang}`;
      link.setAttribute('data-seo-hreflang', 'true');
      document.head.appendChild(link);
    }
    const fallback = document.createElement('link');
    fallback.rel = 'alternate';
    fallback.hreflang = 'x-default';
    fallback.href = `${origin}${path}`;
    fallback.setAttribute('data-seo-hreflang', 'true');
    document.head.appendChild(fallback);
  }
}

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<PublicFrontendConfig>(DEFAULT_PUBLIC_CONFIG);
  const [loading, setLoading] = useState(true);
  const { i18n } = useTranslation();

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await getPublicFrontendConfig();
        if (data) {
          // BUG-45: un campo null/undefined del backend no debe sobrescribir
          // el default (config.restaurant_phone.replace(...) reventaba con
          // pantalla en blanco al no haber ErrorBoundary)
          const sanitized = Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== null && value !== undefined)
          );
          setConfig({
            ...DEFAULT_PUBLIC_CONFIG,
            ...sanitized,
            specialties: data.specialties || DEFAULT_PUBLIC_CONFIG.specialties,
            schedule: data.schedule || DEFAULT_PUBLIC_CONFIG.schedule
          });
        }
      } catch (error) {
        console.error('Error fetching public config:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  // M1: el <title> refleja el nombre configurado; M3: tema de marca;
  // N4.6: favicon/manifest/theme-color con la marca (PWA)
  useEffect(() => {
    document.title = config.restaurant_tagline
      ? `${config.restaurant_name} — ${config.restaurant_tagline}`
      : config.restaurant_name;
    applyBrandTheme(config);
    applyPwaBranding(config);
    applySeo(config);
  }, [config]);

  // M5: idiomas activos y por defecto configurables. Si el idioma actual no
  // está soportado por este despliegue, se cambia al idioma por defecto.
  useEffect(() => {
    if (loading) return;
    const supported = config.languages_supported.split(',').map((lang) => lang.trim()).filter(Boolean);
    if (supported.length === 0) return;
    if (i18n?.options) {
      i18n.options.fallbackLng = [config.language_default];
    }
    if (typeof i18n?.changeLanguage === 'function' && !supported.includes(getBaseLanguage(i18n.language))) {
      i18n.changeLanguage(config.language_default);
    }
  }, [loading, config.languages_supported, config.language_default, i18n]);

  return (
    <ConfigContext.Provider value={{ config, loading }}>
      {children}
    </ConfigContext.Provider>
  );
};
