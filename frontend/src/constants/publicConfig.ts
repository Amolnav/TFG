import type { PublicFrontendConfig, SpecialtiesConfig } from '../types';

/**
 * Defaults NEUTROS del frontend (plan de modularidad M1/M2).
 *
 * Deben coincidir con los de backend/src/config/configSchema.js: son el
 * estado "sin configurar" y nunca contienen datos de un cliente concreto —
 * así un fallo de configuración se VE ("Mi Restaurante") en vez de
 * camuflarse de dato real.
 */

export const DEFAULT_SPECIALTIES: SpecialtiesConfig = {
  title: {
    es: 'Nuestras Especialidades',
    en: 'Our Specialties',
    fr: 'Nos Spécialités',
  },
  items: [],
};

export const DEFAULT_PUBLIC_CONFIG: PublicFrontendConfig = {
  restaurant_name: 'Mi Restaurante',
  restaurant_tagline: '',
  restaurant_address: '',
  restaurant_phone: '',
  restaurant_email: '',
  social_instagram: '',
  social_facebook: '',
  maps_url: '',
  map_image: '',
  timezone: 'Europe/Madrid',
  currency: 'EUR',
  languages_supported: 'es,en,fr',
  language_default: 'es',
  brand_logo: '🍽️',
  theme_primary: '#0F172A',
  theme_primary_light: '#1E293B',
  theme_accent: '#E11D48',
  theme_accent_hover: '#BE123C',
  theme_decor: '#D97706',
  font_heading: "'Playfair Display', Georgia, serif",
  font_body: "'Lato', 'Helvetica Neue', sans-serif",
  fonts_url:
    'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Lato:wght@300;400;700&display=swap',
  captcha_enabled: 'false',
  captcha_site_key: '',
  zone_selection_enabled: 'false',
  zones: [],
  waitlist_enabled: 'true',
  specialties: DEFAULT_SPECIALTIES,
  hero: {
    title: {
      es: 'Bienvenido a Mi Restaurante',
      en: 'Welcome to Mi Restaurante',
      fr: 'Bienvenue à Mi Restaurante',
    },
    subtitle: {
      es: 'Configura la identidad de tu restaurante desde el panel de administración.',
      en: 'Set up your restaurant identity from the admin panel.',
      fr: "Configurez l'identité de votre restaurant depuis le panneau d'administration.",
    },
    image: '',
  },
  about: {
    title: { es: 'Sobre Nosotros', en: 'About Us', fr: 'À propos de nous' },
    text: {
      es: 'Presenta aquí la historia de tu restaurante. Este texto se edita desde el panel de administración.',
      en: 'Introduce your restaurant here. This text is edited from the admin panel.',
      fr: "Présentez ici votre restaurant. Ce texte se modifie depuis le panneau d'administration.",
    },
    image: '',
  },
  history: {
    title: { es: 'Nuestra Historia', en: 'Our Story', fr: 'Notre Histoire' },
    subtitle: {},
    valuesTitle: { es: 'Nuestros Valores', en: 'Our Values', fr: 'Nos Valeurs' },
    sections: [],
    values: [],
  },
  reservation: { quote: {}, image: '' },
  menuNotes: { title: {}, text: {} },
  schedule: { openingDays: [], shifts: [] },
};
