import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../styles/pages/admin/AdminPages.css';
import { getSystemConfig, updateSystemConfig } from '../../services/api';
import type {
  AboutConfig,
  HeroConfig,
  HistoryConfig,
  LocalizedText,
  MenuNotesConfig,
  ReservationContentConfig,
  SystemConfig,
} from '../../types';

/**
 * M2: editor del contenido de marca de la web pública (hero, sobre nosotros,
 * historia, página de reservas y nota de la carta). Cada bloque vive en una
 * clave *_config de SystemConfig con textos multiidioma; los idiomas del
 * editor salen de languages_supported (M5).
 */

const buttonStyles = {
  primary: { cursor: 'pointer', padding: '0.5rem 1.25rem', background: 'var(--accent-action)', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 600 } as const,
  ghost: { cursor: 'pointer', padding: '0.35rem 0.75rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', fontWeight: 600, fontSize: '0.8rem' } as const,
  danger: { cursor: 'pointer', padding: '0.25rem 0.6rem', background: 'var(--accent-danger)', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 } as const,
};

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

interface LocalizedFieldProps {
  labelKey: string;
  languages: string[];
  value: LocalizedText | undefined;
  onChange: (next: LocalizedText) => void;
  multiline?: boolean;
}

function LocalizedField({ labelKey, languages, value, onChange, multiline }: LocalizedFieldProps) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(languages.length, 3)}, 1fr)`, gap: '1rem', marginBottom: '0.75rem' }}>
      {languages.map((lang) => (
        <div key={lang} className="admin-modal__form-group">
          <label style={{ fontSize: '0.8rem' }}>{t(labelKey, { lang: lang.toUpperCase() })}</label>
          {multiline ? (
            <textarea
              rows={3}
              value={value?.[lang] || ''}
              onChange={(e) => onChange({ ...(value || {}), [lang]: e.target.value })}
            />
          ) : (
            <input
              type="text"
              value={value?.[lang] || ''}
              onChange={(e) => onChange({ ...(value || {}), [lang]: e.target.value })}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function ContenidoPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [savingKey, setSavingKey] = useState('');

  const [languages, setLanguages] = useState<string[]>(['es', 'en', 'fr']);
  const [hero, setHero] = useState<HeroConfig>({ title: {} });
  const [about, setAbout] = useState<AboutConfig>({ title: {}, text: {} });
  const [history, setHistory] = useState<HistoryConfig>({ title: {}, sections: [], values: [] });
  const [reservation, setReservation] = useState<ReservationContentConfig>({ quote: {}, image: '' });
  const [menuNotes, setMenuNotes] = useState<MenuNotesConfig>({ title: {}, text: {} });

  const loadData = useCallback(async () => {
    try {
      const config: SystemConfig = await getSystemConfig();
      const supported = (config.languages_supported || 'es,en,fr')
        .split(',').map((lang) => lang.trim()).filter(Boolean);
      setLanguages(supported.length > 0 ? supported : ['es']);
      setHero(parseJson<HeroConfig>(config.hero_config, { title: {}, subtitle: {}, image: '' }));
      setAbout(parseJson<AboutConfig>(config.about_config, { title: {}, text: {}, image: '' }));
      setHistory(parseJson<HistoryConfig>(config.history_config, { title: {}, subtitle: {}, sections: [], values: [] }));
      setReservation(parseJson<ReservationContentConfig>(config.reservation_config, { quote: {}, image: '' }));
      setMenuNotes(parseJson<MenuNotesConfig>(config.menu_notes_config, { title: {}, text: {} }));
      setLoadError('');
    } catch (err) {
      console.error(err);
      setLoadError(t('admin.content.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const save = async (key: string, value: object) => {
    setSavingKey(key);
    setFeedback('');
    try {
      await updateSystemConfig({ [key]: JSON.stringify(value) });
      setFeedback(t('admin.content.saved'));
    } catch (err) {
      console.error(err);
      setFeedback(t('admin.content.saveError'));
    } finally {
      setSavingKey('');
    }
  };

  const updateSection = (index: number, patch: Partial<NonNullable<HistoryConfig['sections']>[number]>) => {
    const sections = [...(history.sections || [])];
    sections[index] = { ...sections[index], ...patch };
    setHistory({ ...history, sections });
  };

  const updateValue = (index: number, patch: Partial<NonNullable<HistoryConfig['values']>[number]>) => {
    const values = [...(history.values || [])];
    values[index] = { ...values[index], ...patch };
    setHistory({ ...history, values });
  };

  // Los párrafos de cada sección se editan como texto separado por líneas en
  // blanco, por idioma; aquí se re-ensambla el array de LocalizedText.
  const paragraphsToText = (paragraphs: LocalizedText[], lang: string) =>
    paragraphs.map((paragraph) => paragraph[lang] || '').join('\n\n');

  const textToParagraphs = (paragraphs: LocalizedText[], lang: string, text: string): LocalizedText[] => {
    const parts = text.split(/\n\s*\n/);
    const maxLength = Math.max(parts.length, ...languages.map((l) => l === lang ? 0 : paragraphs.filter((p) => p[l] !== undefined).length));
    const result: LocalizedText[] = [];
    for (let i = 0; i < Math.max(parts.length, maxLength); i++) {
      result.push({ ...(paragraphs[i] || {}), [lang]: parts[i] ?? '' });
    }
    return result;
  };

  if (loading) {
    return <div className="state-loading"><span className="spinner">⏳</span> {t('admin.content.loading')}</div>;
  }

  const sectionCard = (title: string, key: string, form: object, body: React.ReactNode) => (
    <div className="config-section" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, border: 'none', padding: 0 }}>{title}</h3>
        <button
          onClick={() => save(key, form)}
          disabled={savingKey === key}
          style={buttonStyles.primary}
        >
          {savingKey === key ? t('admin.common.saving') : t('admin.common.save')}
        </button>
      </div>
      {body}
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <h1>{t('admin.content.title')}</h1>
        <p>{t('admin.content.subtitle')}</p>
      </div>

      {loadError && <div className="error-msg" role="alert" style={{ marginBottom: '1rem' }}>{loadError}</div>}
      {feedback && <div style={{ marginBottom: '1rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'var(--bg-light)', border: '1px solid var(--border)' }}>{feedback}</div>}

      {/* Hero */}
      {sectionCard(`🖼️ ${t('admin.content.heroSection')}`, 'hero_config', hero, (
        <>
          <LocalizedField labelKey="admin.content.titleField" languages={languages} value={hero.title}
            onChange={(title) => setHero({ ...hero, title })} />
          <LocalizedField labelKey="admin.content.subtitleField" languages={languages} value={hero.subtitle} multiline
            onChange={(subtitle) => setHero({ ...hero, subtitle })} />
          <div className="admin-modal__form-group">
            <label style={{ fontSize: '0.8rem' }}>{t('admin.content.imageField')}</label>
            <input type="text" value={hero.image || ''} onChange={(e) => setHero({ ...hero, image: e.target.value })} />
          </div>
        </>
      ))}

      {/* Sobre nosotros */}
      {sectionCard(`🏠 ${t('admin.content.aboutSection')}`, 'about_config', about, (
        <>
          <LocalizedField labelKey="admin.content.titleField" languages={languages} value={about.title}
            onChange={(title) => setAbout({ ...about, title })} />
          <LocalizedField labelKey="admin.content.textField" languages={languages} value={about.text} multiline
            onChange={(text) => setAbout({ ...about, text })} />
          <div className="admin-modal__form-group">
            <label style={{ fontSize: '0.8rem' }}>{t('admin.content.imageField')}</label>
            <input type="text" value={about.image || ''} onChange={(e) => setAbout({ ...about, image: e.target.value })} />
          </div>
        </>
      ))}

      {/* Historia */}
      {sectionCard(`📖 ${t('admin.content.historySection')}`, 'history_config', history, (
        <>
          <LocalizedField labelKey="admin.content.titleField" languages={languages} value={history.title}
            onChange={(title) => setHistory({ ...history, title })} />
          <LocalizedField labelKey="admin.content.subtitleField" languages={languages} value={history.subtitle}
            onChange={(subtitle) => setHistory({ ...history, subtitle })} />

          <h4 style={{ margin: '1rem 0 0.5rem' }}>{t('admin.content.sectionsTitle')}</h4>
          {(history.sections || []).map((section, index) => (
            <div key={index} style={{ padding: '1rem', background: 'var(--bg-light)', borderRadius: '8px', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <strong>{t('admin.content.sectionNumber', { number: index + 1 })}</strong>
                <button
                  onClick={() => setHistory({ ...history, sections: (history.sections || []).filter((_, i) => i !== index) })}
                  style={buttonStyles.danger}
                >
                  {t('admin.content.removeSection')}
                </button>
              </div>
              <LocalizedField labelKey="admin.content.titleField" languages={languages} value={section.title}
                onChange={(title) => updateSection(index, { title })} />
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(languages.length, 3)}, 1fr)`, gap: '1rem' }}>
                {languages.map((lang) => (
                  <div key={lang} className="admin-modal__form-group">
                    <label style={{ fontSize: '0.8rem' }}>{t('admin.content.paragraphsField', { lang: lang.toUpperCase() })}</label>
                    <textarea
                      rows={5}
                      value={paragraphsToText(section.paragraphs || [], lang)}
                      onChange={(e) => updateSection(index, {
                        paragraphs: textToParagraphs(section.paragraphs || [], lang, e.target.value),
                      })}
                    />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('admin.content.paragraphsHelp')}</div>
            </div>
          ))}
          <button
            onClick={() => setHistory({ ...history, sections: [...(history.sections || []), { title: {}, paragraphs: [] }] })}
            style={buttonStyles.ghost}
          >
            {t('admin.content.addSection')}
          </button>

          <h4 style={{ margin: '1.25rem 0 0.5rem' }}>{t('admin.content.valuesList')}</h4>
          <LocalizedField labelKey="admin.content.valuesTitleField" languages={languages} value={history.valuesTitle}
            onChange={(valuesTitle) => setHistory({ ...history, valuesTitle })} />
          {(history.values || []).map((value, index) => (
            <div key={index} style={{ padding: '1rem', background: 'var(--bg-light)', borderRadius: '8px', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <strong>{t('admin.content.valueNumber', { number: index + 1 })}</strong>
                <button
                  onClick={() => setHistory({ ...history, values: (history.values || []).filter((_, i) => i !== index) })}
                  style={buttonStyles.danger}
                >
                  {t('admin.content.removeValue')}
                </button>
              </div>
              <LocalizedField labelKey="admin.content.titleField" languages={languages} value={value.title}
                onChange={(title) => updateValue(index, { title })} />
              <LocalizedField labelKey="admin.content.textField" languages={languages} value={value.text} multiline
                onChange={(text) => updateValue(index, { text })} />
            </div>
          ))}
          <button
            onClick={() => setHistory({ ...history, values: [...(history.values || []), { title: {}, text: {} }] })}
            style={buttonStyles.ghost}
          >
            {t('admin.content.addValue')}
          </button>

          <h4 style={{ margin: '1.25rem 0 0.5rem' }}>{t('admin.content.visitSection')}</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <input
              type="checkbox"
              id="visit-enabled"
              checked={Boolean(history.visit)}
              onChange={(e) => setHistory({
                ...history,
                visit: e.target.checked ? { title: {}, text: {} } : undefined,
              })}
              style={{ width: 'auto' }}
            />
            <label htmlFor="visit-enabled" style={{ margin: 0, cursor: 'pointer' }}>{t('admin.content.visitEnabled')}</label>
          </div>
          {history.visit && (
            <>
              <LocalizedField labelKey="admin.content.titleField" languages={languages} value={history.visit.title}
                onChange={(title) => setHistory({ ...history, visit: { ...history.visit!, title } })} />
              <LocalizedField labelKey="admin.content.textField" languages={languages} value={history.visit.text} multiline
                onChange={(text) => setHistory({ ...history, visit: { ...history.visit!, text } })} />
            </>
          )}
        </>
      ))}

      {/* Página de reservas */}
      {sectionCard(`📆 ${t('admin.content.reservationSection')}`, 'reservation_config', reservation, (
        <>
          <LocalizedField labelKey="admin.content.quoteField" languages={languages} value={reservation.quote}
            onChange={(quote) => setReservation({ ...reservation, quote })} />
          <div className="admin-modal__form-group">
            <label style={{ fontSize: '0.8rem' }}>{t('admin.content.imageField')}</label>
            <input type="text" value={reservation.image || ''} onChange={(e) => setReservation({ ...reservation, image: e.target.value })} />
          </div>
        </>
      ))}

      {/* Nota de la carta */}
      {sectionCard(`📜 ${t('admin.content.menuNotesSection')}`, 'menu_notes_config', menuNotes, (
        <>
          <LocalizedField labelKey="admin.content.titleField" languages={languages} value={menuNotes.title}
            onChange={(title) => setMenuNotes({ ...menuNotes, title })} />
          <LocalizedField labelKey="admin.content.textField" languages={languages} value={menuNotes.text} multiline
            onChange={(text) => setMenuNotes({ ...menuNotes, text })} />
        </>
      ))}
    </div>
  );
}
