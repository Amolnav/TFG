/**
 * Fuente única de verdad de las claves de SystemConfig (plan de modularidad M1).
 *
 * Cada entrada define:
 *   - default: valor neutro (string, como se persiste en BD). NUNCA datos de un
 *     cliente concreto: un despliegue sin configurar debe *verse* sin marca.
 *   - public: si la clave se expone en GET /api/public/config.
 *   - json: si el valor es un JSON serializado (se parsea al exponerlo).
 *   - validate(v): validador del valor recibido como string (whitelist BUG-05).
 *   - hint: mensaje de ayuda cuando la validación falla.
 */

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const LANG_LIST = /^[a-z]{2}(-[A-Za-z]{2})?(,[a-z]{2}(-[A-Za-z]{2})?)*$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Texto multiidioma: objeto { es: '...', en: '...' } con al menos una entrada.
 * Los idiomas NO están fijados (M5): cualquier código de idioma es admisible.
 */
function isLocalizedText(value) {
  if (!isPlainObject(value)) return false;
  const entries = Object.entries(value);
  if (entries.length === 0) return false;
  return entries.every(([lang, text]) => /^[a-z]{2}(-[A-Za-z]{2})?$/.test(lang) && typeof text === 'string');
}

function isOptionalLocalizedText(value) {
  return value === undefined || isLocalizedText(value);
}

function jsonValidator(shapeCheck) {
  return (value) => {
    try {
      const parsed = JSON.parse(value);
      return shapeCheck ? shapeCheck(parsed) : true;
    } catch {
      return false;
    }
  };
}

function isSpecialtiesConfig(parsed) {
  if (!isPlainObject(parsed)) return false;
  if (!isLocalizedText(parsed.title)) return false;
  if (!Array.isArray(parsed.items)) return false;
  // N platos (M2): sin límite fijo; cada uno con nombre/descripción multiidioma
  return parsed.items.every((item) =>
    isPlainObject(item) &&
    isLocalizedText(item.name) &&
    isLocalizedText(item.description) &&
    typeof item.image === 'string'
  );
}

function isHeroConfig(parsed) {
  return isPlainObject(parsed) &&
    isLocalizedText(parsed.title) &&
    isOptionalLocalizedText(parsed.subtitle) &&
    (parsed.image === undefined || typeof parsed.image === 'string');
}

function isAboutConfig(parsed) {
  return isPlainObject(parsed) &&
    isLocalizedText(parsed.title) &&
    isLocalizedText(parsed.text) &&
    (parsed.image === undefined || typeof parsed.image === 'string');
}

function isHistoryConfig(parsed) {
  if (!isPlainObject(parsed)) return false;
  if (!isLocalizedText(parsed.title)) return false;
  if (!isOptionalLocalizedText(parsed.subtitle)) return false;
  if (!isOptionalLocalizedText(parsed.valuesTitle)) return false;
  const sectionsOk = (parsed.sections ?? []) instanceof Array &&
    (parsed.sections ?? []).every((section) =>
      isPlainObject(section) &&
      isLocalizedText(section.title) &&
      Array.isArray(section.paragraphs) &&
      section.paragraphs.every(isLocalizedText)
    );
  const valuesOk = (parsed.values ?? []) instanceof Array &&
    (parsed.values ?? []).every((item) =>
      isPlainObject(item) && isLocalizedText(item.title) && isLocalizedText(item.text)
    );
  const visitOk = parsed.visit === undefined ||
    (isPlainObject(parsed.visit) && isLocalizedText(parsed.visit.title) && isLocalizedText(parsed.visit.text));
  return sectionsOk && valuesOk && visitOk;
}

function isReservationConfig(parsed) {
  return isPlainObject(parsed) &&
    isOptionalLocalizedText(parsed.quote) &&
    (parsed.image === undefined || typeof parsed.image === 'string');
}

function isMenuNotesConfig(parsed) {
  return isPlainObject(parsed) &&
    isOptionalLocalizedText(parsed.title) &&
    isOptionalLocalizedText(parsed.text);
}

function isDurationsConfig(parsed) {
  if (!Array.isArray(parsed) || parsed.length === 0) return false;
  return parsed.every((tier) =>
    isPlainObject(tier) &&
    (tier.maxPax === null || (Number.isInteger(tier.maxPax) && tier.maxPax > 0)) &&
    Number.isInteger(tier.minutes) && tier.minutes > 0
  ) && parsed.some((tier) => tier.maxPax === null); // siempre debe existir un tramo "resto"
}

const maxLength = (n) => (v) => v.length <= n;
const optionalUrl = (v) => v === '' || /^(https?:\/\/|\/)/.test(v);
const positiveInt = (v) => /^\d+$/.test(v) && parseInt(v, 10) > 0;
const nonNegativeInt = (v) => /^\d+$/.test(v);
const offsetsList = (v) => /^-?\d+(,-?\d+)*$/.test(v);

const CONFIG_SCHEMA = {
  // ── Identidad y contacto ────────────────────────────────────────────
  restaurant_name: {
    default: 'Mi Restaurante',
    public: true,
    validate: (v) => v.length > 0 && v.length <= 200,
    hint: 'no puede estar vacío (máx. 200 caracteres)'
  },
  restaurant_tagline: {
    default: '',
    public: true,
    validate: maxLength(200),
    hint: 'máximo 200 caracteres'
  },
  restaurant_address: {
    default: '',
    public: true,
    validate: maxLength(300),
    hint: 'máximo 300 caracteres'
  },
  restaurant_phone: {
    default: '',
    public: true,
    validate: maxLength(50),
    hint: 'máximo 50 caracteres'
  },
  restaurant_email: {
    default: '',
    public: true,
    validate: maxLength(200),
    hint: 'máximo 200 caracteres'
  },
  social_instagram: {
    default: '',
    public: true,
    validate: optionalUrl,
    hint: 'debe ser una URL (https://...) o vacío'
  },
  social_facebook: {
    default: '',
    public: true,
    validate: optionalUrl,
    hint: 'debe ser una URL (https://...) o vacío'
  },
  maps_url: {
    default: '',
    public: true,
    validate: optionalUrl,
    hint: 'debe ser una URL (https://...) o vacío'
  },
  map_image: {
    default: '',
    public: true,
    validate: optionalUrl,
    hint: 'debe ser una ruta (/branding/...) o URL, o vacío'
  },
  timezone: {
    default: 'Europe/Madrid',
    public: true,
    validate: (v) => {
      try {
        Intl.DateTimeFormat('en', { timeZone: v });
        return true;
      } catch {
        return false;
      }
    },
    hint: 'debe ser una zona horaria IANA válida, p. ej. "Europe/Madrid"'
  },
  currency: {
    default: 'EUR',
    public: true,
    validate: (v) => /^[A-Z]{3}$/.test(v),
    hint: 'debe ser un código ISO 4217 de 3 letras, p. ej. "EUR"'
  },

  // ── Idiomas (M5) ────────────────────────────────────────────────────
  languages_supported: {
    default: 'es,en,fr',
    public: true,
    validate: (v) => LANG_LIST.test(v),
    hint: 'lista de códigos de idioma separados por comas, p. ej. "es,en,fr"'
  },
  language_default: {
    default: 'es',
    public: true,
    validate: (v) => /^[a-z]{2}(-[A-Za-z]{2})?$/.test(v),
    hint: 'código de idioma, p. ej. "es"'
  },

  // ── Marca visual (M3) ───────────────────────────────────────────────
  brand_logo: {
    default: '🍽️',
    public: true,
    validate: (v) => v.length > 0 && v.length <= 300,
    hint: 'emoji o ruta de imagen (/branding/logo.svg)'
  },
  theme_primary: {
    default: '#0F172A',
    public: true,
    validate: (v) => HEX_COLOR.test(v),
    hint: 'color hex, p. ej. "#0F172A"'
  },
  theme_primary_light: {
    default: '#1E293B',
    public: true,
    validate: (v) => HEX_COLOR.test(v),
    hint: 'color hex, p. ej. "#1E293B"'
  },
  theme_accent: {
    default: '#E11D48',
    public: true,
    validate: (v) => HEX_COLOR.test(v),
    hint: 'color hex, p. ej. "#E11D48"'
  },
  theme_accent_hover: {
    default: '#BE123C',
    public: true,
    validate: (v) => HEX_COLOR.test(v),
    hint: 'color hex, p. ej. "#BE123C"'
  },
  theme_decor: {
    default: '#D97706',
    public: true,
    validate: (v) => HEX_COLOR.test(v),
    hint: 'color hex, p. ej. "#D97706"'
  },
  font_heading: {
    default: "'Playfair Display', Georgia, serif",
    public: true,
    validate: (v) => v.length > 0 && v.length <= 200,
    hint: 'pila de fuentes CSS, p. ej. "\'Playfair Display\', serif"'
  },
  font_body: {
    default: "'Lato', 'Helvetica Neue', sans-serif",
    public: true,
    validate: (v) => v.length > 0 && v.length <= 200,
    hint: 'pila de fuentes CSS, p. ej. "\'Lato\', sans-serif"'
  },
  fonts_url: {
    default: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Lato:wght@300;400;700&display=swap',
    public: true,
    validate: optionalUrl,
    hint: 'URL de hoja de estilos de fuentes (Google Fonts) o vacío'
  },

  // ── Contenido editable multiidioma (M2) ─────────────────────────────
  specialties_config: {
    default: JSON.stringify({
      title: { es: 'Nuestras Especialidades', en: 'Our Specialties', fr: 'Nos Spécialités' },
      items: []
    }),
    public: false, // se expone parseado como "specialties"
    json: true,
    publicAs: 'specialties',
    validate: jsonValidator(isSpecialtiesConfig),
    hint: 'JSON con { title: {es,...}, items: [{ id, name, description, image }] }'
  },
  hero_config: {
    default: JSON.stringify({
      title: { es: 'Bienvenido a Mi Restaurante', en: 'Welcome to Mi Restaurante', fr: 'Bienvenue à Mi Restaurante' },
      subtitle: {
        es: 'Configura la identidad de tu restaurante desde el panel de administración.',
        en: 'Set up your restaurant identity from the admin panel.',
        fr: "Configurez l'identité de votre restaurant depuis le panneau d'administration."
      },
      image: ''
    }),
    public: false,
    json: true,
    publicAs: 'hero',
    validate: jsonValidator(isHeroConfig),
    hint: 'JSON con { title: {es,...}, subtitle?: {es,...}, image?: "/branding/hero.jpg" }'
  },
  about_config: {
    default: JSON.stringify({
      title: { es: 'Sobre Nosotros', en: 'About Us', fr: 'À propos de nous' },
      text: {
        es: 'Presenta aquí la historia de tu restaurante. Este texto se edita desde el panel de administración.',
        en: 'Introduce your restaurant here. This text is edited from the admin panel.',
        fr: "Présentez ici votre restaurant. Ce texte se modifie depuis le panneau d'administration."
      },
      image: ''
    }),
    public: false,
    json: true,
    publicAs: 'about',
    validate: jsonValidator(isAboutConfig),
    hint: 'JSON con { title: {es,...}, text: {es,...}, image?: "/branding/about.jpg" }'
  },
  history_config: {
    default: JSON.stringify({
      title: { es: 'Nuestra Historia', en: 'Our Story', fr: 'Notre Histoire' },
      subtitle: {},
      valuesTitle: { es: 'Nuestros Valores', en: 'Our Values', fr: 'Nos Valeurs' },
      sections: [],
      values: []
    }),
    public: false,
    json: true,
    publicAs: 'history',
    validate: jsonValidator(isHistoryConfig),
    hint: 'JSON con { title, subtitle?, sections: [{title, paragraphs: [...]}], values: [{title, text}], visit?: {title, text} }'
  },
  reservation_config: {
    default: JSON.stringify({ quote: {}, image: '' }),
    public: false,
    json: true,
    publicAs: 'reservation',
    validate: jsonValidator(isReservationConfig),
    hint: 'JSON con { quote?: {es,...}, image?: "/branding/reservation.jpg" }'
  },
  menu_notes_config: {
    default: JSON.stringify({ title: {}, text: {} }),
    public: false,
    json: true,
    publicAs: 'menuNotes',
    validate: jsonValidator(isMenuNotesConfig),
    hint: 'JSON con { title?: {es,...}, text?: {es,...} }'
  },

  // ── Reglas de negocio (M4, solo backoffice) ─────────────────────────
  booking_durations: {
    default: JSON.stringify([
      { maxPax: 2, minutes: 90 },
      { maxPax: 4, minutes: 120 },
      { maxPax: 6, minutes: 150 },
      { maxPax: null, minutes: 180 }
    ]),
    public: false,
    json: true,
    validate: jsonValidator(isDurationsConfig),
    hint: 'JSON [{ maxPax: n | null, minutes: n }] con un tramo final maxPax null'
  },
  booking_min_hours_ahead: {
    default: '2',
    public: false,
    validate: nonNegativeInt,
    hint: 'número entero de horas (0 o más)'
  },
  booking_max_days_ahead: {
    default: '30',
    public: false,
    validate: positiveInt,
    hint: 'número entero de días (mayor que 0)'
  },
  booking_suggestion_offsets: {
    default: '-30,30,-60,60',
    public: false,
    validate: offsetsList,
    hint: 'lista de minutos separados por comas, p. ej. "-30,30,-60,60"'
  },
  booking_max_suggestions: {
    default: '4',
    public: false,
    validate: positiveInt,
    hint: 'número entero mayor que 0'
  },
  no_show_threshold: {
    default: '3',
    public: false,
    validate: positiveInt,
    hint: 'número entero mayor que 0'
  },
  pax_min: {
    default: '1',
    public: false,
    validate: positiveInt,
    hint: 'número entero mayor que 0'
  },

  // ── Wizard de reserva (N3.2) ────────────────────────────────────────
  zone_selection_enabled: {
    default: 'false',
    public: true,
    validate: (v) => v === 'true' || v === 'false',
    hint: "'true' o 'false' (mostrar al cliente el selector de zona si hay más de una)"
  },

  // ── Recordatorios y reconfirmación (N1.2) ───────────────────────────
  reminder_enabled: {
    default: 'true',
    public: false,
    validate: (v) => v === 'true' || v === 'false',
    hint: "'true' o 'false' (enviar recordatorio con enlace de reconfirmación)"
  },
  reminder_hours_before: {
    default: '24',
    public: false,
    validate: positiveInt,
    hint: 'horas de antelación del recordatorio (entero mayor que 0)'
  },
  reminder_unconfirmed_policy: {
    default: 'notify',
    public: false,
    validate: (v) => v === 'notify' || v === 'autocancel',
    hint: "'notify' (solo avisa al panel) o 'autocancel' (cancela si no se reconfirma)"
  },
  reminder_autocancel_hours_before: {
    default: '4',
    public: false,
    validate: positiveInt,
    hint: 'horas antes de la reserva para el autocancelado (debe ser menor que reminder_hours_before)'
  },

  // ── Lista de espera (N1.4) ──────────────────────────────────────────
  waitlist_enabled: {
    default: 'true',
    public: true,
    validate: (v) => v === 'true' || v === 'false',
    hint: "'true' o 'false' (ofrecer lista de espera cuando un día está completo)"
  },
  waitlist_hold_hours: {
    default: '2',
    public: false,
    validate: positiveInt,
    hint: 'horas de validez del aviso antes de pasar al siguiente de la lista (entero mayor que 0)'
  },

  // ── Petición de reseña post-visita (N3.4) ───────────────────────────
  review_request_enabled: {
    default: 'false',
    public: false,
    validate: (v) => v === 'true' || v === 'false',
    hint: "'true' o 'false' (email \"¿qué tal todo?\" al completarse una reserva; requiere GOOGLE_PLACE_ID)"
  },
  review_request_min_days_between: {
    default: '30',
    public: false,
    validate: positiveInt,
    hint: 'días mínimos entre peticiones de reseña al mismo cliente (entero mayor que 0)'
  },

  // ── RGPD (N4.4) ─────────────────────────────────────────────────────
  gdpr_retention_months: {
    default: '0',
    public: false,
    validate: nonNegativeInt,
    hint: 'meses sin actividad tras los que se anonimiza al cliente (0 = desactivado)'
  },

  // ── Seguridad de la API pública (N4.1) ──────────────────────────────
  rate_limit_public_per_minute: {
    default: '60',
    public: false,
    validate: positiveInt,
    hint: 'peticiones por minuto e IP en /api/public (entero mayor que 0)'
  },
  rate_limit_login_per_15min: {
    default: '10',
    public: false,
    validate: positiveInt,
    hint: 'intentos de login fallidos por 15 minutos e IP (entero mayor que 0)'
  },
  captcha_enabled: {
    default: 'false',
    public: true,
    validate: (v) => v === 'true' || v === 'false',
    hint: "'true' o 'false'"
  },
  captcha_site_key: {
    default: '',
    public: true,
    validate: maxLength(100),
    hint: 'site key de Cloudflare Turnstile (vacío = sin captcha)'
  },
  captcha_secret_key: {
    default: '',
    public: false,
    validate: maxLength(100),
    hint: 'secret key de Cloudflare Turnstile (nunca se expone al público)'
  }
};

const CONFIG_DEFAULTS = Object.fromEntries(
  Object.entries(CONFIG_SCHEMA).map(([key, entry]) => [key, entry.default])
);

module.exports = {
  CONFIG_SCHEMA,
  CONFIG_DEFAULTS,
  isLocalizedText
};
