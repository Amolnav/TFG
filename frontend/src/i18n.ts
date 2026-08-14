import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// M5: los ficheros de idioma se registran automáticamente — añadir un idioma
// nuevo es crear src/locales/<código>.json y activarlo en la configuración
// (languages_supported), sin tocar tipos ni este módulo.
const localeModules = import.meta.glob('./locales/*.json', { eager: true }) as Record<
  string,
  { default: Record<string, unknown> }
>;

const resources = Object.fromEntries(
  Object.entries(localeModules).map(([path, module]) => {
    const code = path.replace('./locales/', '').replace('.json', '');
    return [code, { translation: module.default }];
  })
);

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    // M5: el idioma por defecto real llega de la configuración del despliegue
    // (ConfigProvider lo ajusta al cargar); 'es' es solo el arranque.
    fallbackLng: 'es',
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });

// M5: <html lang> dinámico según el idioma activo (también en la carga
// inicial, cuando el detector resuelve un idioma distinto al del HTML)
function applyHtmlLang(language: string | undefined) {
  if (typeof document !== 'undefined' && language) {
    document.documentElement.lang = language.split('-')[0];
  }
}

i18n.on('initialized', () => applyHtmlLang(i18n.language));
i18n.on('languageChanged', applyHtmlLang);
applyHtmlLang(i18n.language);

export default i18n;
