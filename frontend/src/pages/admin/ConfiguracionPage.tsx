
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import '../../styles/pages/admin/AdminPages.css';
import {
  getShifts,
  updateShift,
  createShift,
  deleteShift,
  getSystemConfig,
  updateSystemConfig,
  getClosures,
  createClosure,
  deleteClosure,
} from '../../services/api';
import type { Shift, SystemConfig, Closure } from '../../types';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

interface DurationTier {
  maxPax: number | null;
  minutes: number;
}

interface ShiftForm {
  id: number | null;
  name: string;
  startTime: string;
  endTime: string;
  slotInterval: number;
  isActive: boolean;
  daysOfWeek: number[];
  maxBookingsPerSlot: number | null;
}

const buttonStyles = {
  primary: { cursor: 'pointer', padding: '0.5rem 1.25rem', background: 'var(--accent-action)', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 600 } as const,
  ghost: { cursor: 'pointer', padding: '0.5rem 1.25rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', fontWeight: 600 } as const,
  section: { marginTop: '1rem', width: '100%', cursor: 'pointer', padding: '0.6rem 0.75rem', background: 'var(--bg-light)', color: 'var(--primary)', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 600 } as const,
  small: { cursor: 'pointer', padding: '0.4rem 0.75rem', background: 'var(--accent-action)', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 } as const,
  danger: { cursor: 'pointer', padding: '0.4rem 0.75rem', background: 'var(--accent-danger)', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 } as const,
};

// M1/M3/M4: la configuración cubre identidad ampliada, marca/tema, reglas de
// negocio, CRUD de turnos y cierres. Los días de apertura se DERIVAN de los
// turnos activos (la clave opening_days se eliminó).
export default function ConfiguracionPage() {
  const { t } = useTranslation();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [systemConfig, setSystemConfig] = useState<SystemConfig>({});
  const [loading, setLoading] = useState(true);
  // BUG-47: sin estado de error, un backend caído mostraba los defaults del
  // restaurante ficticio como si fueran datos reales del cliente
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');

  const [editingShift, setEditingShift] = useState<ShiftForm | null>(null);
  const [activeModal, setActiveModal] = useState<'' | 'info' | 'brand' | 'rules' | 'closure' | 'automations'>('');
  const [configForm, setConfigForm] = useState<SystemConfig>({});
  const [rulesForm, setRulesForm] = useState({
    tiers: [] as DurationTier[],
    minHours: '2',
    maxDays: '30',
    offsets: '-30,30,-60,60',
    maxSuggestions: '4',
    noShow: '3',
    paxMin: '1',
  });
  const [closureForm, setClosureForm] = useState({ reason: '', startDate: '', endDate: '', shiftId: '', notifyAffected: false });
  // N1.2/N1.4/N3.4/N4.1/N3.2: automatizaciones y protecciones configurables
  const [autoForm, setAutoForm] = useState({
    reminderEnabled: true,
    reminderHours: '24',
    reminderPolicy: 'notify',
    reminderAutocancelHours: '4',
    waitlistEnabled: true,
    waitlistHoldHours: '2',
    reviewEnabled: false,
    reviewMinDays: '30',
    zoneSelectionEnabled: false,
    captchaEnabled: false,
    captchaSiteKey: '',
    captchaSecretKey: '',
  });
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [shiftsData, configData, closuresData] = await Promise.all([
        getShifts(),
        getSystemConfig(),
        getClosures(),
      ]);
      setShifts(shiftsData);
      setSystemConfig(configData);
      setClosures(closuresData);
      setLoadError('');
    } catch (err) {
      console.error(err);
      setLoadError(t('admin.settings.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const timeToMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  // ── Turnos (M4: CRUD completo) ─────────────────────────────────────

  const handleEditShiftClick = (shift: Shift) => {
    setFormError('');
    setEditingShift({
      id: shift.id,
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      slotInterval: shift.slotInterval,
      isActive: shift.isActive,
      daysOfWeek: [...shift.daysOfWeek],
      maxBookingsPerSlot: shift.maxBookingsPerSlot ?? null,
    });
  };

  const handleNewShiftClick = () => {
    setFormError('');
    setEditingShift({
      id: null,
      name: '',
      startTime: '13:00',
      endTime: '16:00',
      slotInterval: 30,
      isActive: true,
      daysOfWeek: [1, 2, 3, 4, 5, 6, 0],
      maxBookingsPerSlot: null,
    });
  };

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShift) return;
    // BUG-47: validar el rango horario antes de enviar
    if (timeToMinutes(editingShift.startTime) >= timeToMinutes(editingShift.endTime)) {
      setFormError(t('admin.settings.startBeforeEnd'));
      return;
    }
    if (!editingShift.slotInterval || editingShift.slotInterval <= 0) {
      setFormError(t('admin.settings.intervalPositive'));
      return;
    }
    if (editingShift.daysOfWeek.length === 0) {
      setFormError(t('admin.settings.selectShiftDay'));
      return;
    }
    setFormError('');
    setSaving(true);
    const payload = {
      name: editingShift.name,
      startTime: editingShift.startTime,
      endTime: editingShift.endTime,
      slotInterval: editingShift.slotInterval,
      isActive: editingShift.isActive,
      daysOfWeek: editingShift.daysOfWeek,
      maxBookingsPerSlot: editingShift.maxBookingsPerSlot,
    };
    try {
      if (editingShift.id === null) {
        await createShift(payload);
      } else {
        await updateShift(editingShift.id, payload);
      }
      setEditingShift(null);
      loadData();
    } catch (err) {
      console.error(err);
      setFormError(t(editingShift.id === null ? 'admin.settings.createShiftError' : 'admin.settings.updateShiftError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteShift = async () => {
    if (!editingShift || editingShift.id === null) return;
    if (!window.confirm(t('admin.settings.deleteShiftConfirm', { name: editingShift.name }))) return;
    setSaving(true);
    try {
      await deleteShift(editingShift.id);
      setEditingShift(null);
      loadData();
    } catch (err) {
      console.error(err);
      setFormError(t('admin.settings.deleteShiftError'));
    } finally {
      setSaving(false);
    }
  };

  const toggleShiftDay = (day: number) => {
    if (!editingShift) return;
    const has = editingShift.daysOfWeek.includes(day);
    setEditingShift({
      ...editingShift,
      daysOfWeek: has
        ? editingShift.daysOfWeek.filter((d) => d !== day)
        : [...editingShift.daysOfWeek, day],
    });
  };

  // ── Información / Marca ────────────────────────────────────────────

  const openConfigModal = (modal: 'info' | 'brand', keys: string[]) => {
    // BUG-47: el formulario se pre-rellena SOLO con lo que hay en BD; nunca
    // con los defaults hardcodeados (guardarlos pisaría los datos reales)
    setFormError('');
    setConfigForm(Object.fromEntries(keys.map((key) => [key, systemConfig[key] || ''])));
    setActiveModal(modal);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      await updateSystemConfig(configForm);
      setActiveModal('');
      loadData();
    } catch (err) {
      console.error(err);
      setFormError(t('admin.settings.updateConfigError'));
    } finally {
      setSaving(false);
    }
  };

  // ── Reglas de negocio (M4) ─────────────────────────────────────────

  const openRulesModal = () => {
    setFormError('');
    let tiers: DurationTier[] = [
      { maxPax: 2, minutes: 90 },
      { maxPax: 4, minutes: 120 },
      { maxPax: 6, minutes: 150 },
      { maxPax: null, minutes: 180 },
    ];
    try {
      if (systemConfig.booking_durations) tiers = JSON.parse(systemConfig.booking_durations);
    } catch (err) {
      console.error(err);
    }
    setRulesForm({
      tiers,
      minHours: systemConfig.booking_min_hours_ahead || '2',
      maxDays: systemConfig.booking_max_days_ahead || '30',
      offsets: systemConfig.booking_suggestion_offsets || '-30,30,-60,60',
      maxSuggestions: systemConfig.booking_max_suggestions || '4',
      noShow: systemConfig.no_show_threshold || '3',
      paxMin: systemConfig.pax_min || '1',
    });
    setActiveModal('rules');
  };

  const handleSaveRules = async (e: React.FormEvent) => {
    e.preventDefault();
    const tiersValid = rulesForm.tiers.length > 0 &&
      rulesForm.tiers.every((tier) => tier.minutes > 0 && (tier.maxPax === null || tier.maxPax > 0)) &&
      rulesForm.tiers.some((tier) => tier.maxPax === null);
    if (!tiersValid) {
      setFormError(t('admin.settings.rulesInvalid'));
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      await updateSystemConfig({
        booking_durations: JSON.stringify(rulesForm.tiers),
        booking_min_hours_ahead: rulesForm.minHours,
        booking_max_days_ahead: rulesForm.maxDays,
        booking_suggestion_offsets: rulesForm.offsets.replace(/\s/g, ''),
        booking_max_suggestions: rulesForm.maxSuggestions,
        no_show_threshold: rulesForm.noShow,
        pax_min: rulesForm.paxMin,
      });
      setActiveModal('');
      loadData();
    } catch (err) {
      console.error(err);
      setFormError(t('admin.settings.updateConfigError'));
    } finally {
      setSaving(false);
    }
  };

  // ── Automatizaciones (N1.2/N1.4/N3.4/N4.1/N3.2) ────────────────────

  const openAutomationsModal = () => {
    setFormError('');
    setAutoForm({
      reminderEnabled: (systemConfig.reminder_enabled ?? 'true') === 'true',
      reminderHours: systemConfig.reminder_hours_before || '24',
      reminderPolicy: systemConfig.reminder_unconfirmed_policy || 'notify',
      reminderAutocancelHours: systemConfig.reminder_autocancel_hours_before || '4',
      waitlistEnabled: (systemConfig.waitlist_enabled ?? 'true') === 'true',
      waitlistHoldHours: systemConfig.waitlist_hold_hours || '2',
      reviewEnabled: systemConfig.review_request_enabled === 'true',
      reviewMinDays: systemConfig.review_request_min_days_between || '30',
      zoneSelectionEnabled: systemConfig.zone_selection_enabled === 'true',
      captchaEnabled: systemConfig.captcha_enabled === 'true',
      captchaSiteKey: systemConfig.captcha_site_key || '',
      captchaSecretKey: systemConfig.captcha_secret_key || '',
    });
    setActiveModal('automations');
  };

  const handleSaveAutomations = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      await updateSystemConfig({
        reminder_enabled: String(autoForm.reminderEnabled),
        reminder_hours_before: autoForm.reminderHours,
        reminder_unconfirmed_policy: autoForm.reminderPolicy,
        reminder_autocancel_hours_before: autoForm.reminderAutocancelHours,
        waitlist_enabled: String(autoForm.waitlistEnabled),
        waitlist_hold_hours: autoForm.waitlistHoldHours,
        review_request_enabled: String(autoForm.reviewEnabled),
        review_request_min_days_between: autoForm.reviewMinDays,
        zone_selection_enabled: String(autoForm.zoneSelectionEnabled),
        captcha_enabled: String(autoForm.captchaEnabled),
        captcha_site_key: autoForm.captchaSiteKey.trim(),
        captcha_secret_key: autoForm.captchaSecretKey.trim(),
      });
      setActiveModal('');
      loadData();
    } catch (err) {
      console.error(err);
      setFormError(t('admin.settings.updateConfigError'));
    } finally {
      setSaving(false);
    }
  };

  // ── Cierres (M4: UI sobre el backend existente) ────────────────────

  const openClosureModal = () => {
    setFormError('');
    setClosureForm({ reason: '', startDate: '', endDate: '', shiftId: '', notifyAffected: false });
    setActiveModal('closure');
  };

  const handleSaveClosure = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      await createClosure({
        reason: closureForm.reason,
        startDate: closureForm.startDate,
        endDate: closureForm.endDate || null,
        isFullDay: !closureForm.shiftId,
        shiftId: closureForm.shiftId ? Number(closureForm.shiftId) : null,
        notifyAffected: closureForm.notifyAffected,
      });
      setActiveModal('');
      loadData();
    } catch (err) {
      console.error(err);
      setFormError(t('admin.settings.closureCreateError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClosure = async (closure: Closure) => {
    if (!window.confirm(t('admin.settings.closureDeleteConfirm', { reason: closure.reason }))) return;
    try {
      await deleteClosure(closure.id);
      loadData();
    } catch (err) {
      console.error(err);
      setLoadError(t('admin.settings.closureDeleteError'));
    }
  };

  // ── Datos derivados ────────────────────────────────────────────────

  // M4: días de apertura derivados de los turnos activos
  const derivedOpeningDays = [...new Set(shifts.filter((s) => s.isActive).flatMap((s) => s.daysOfWeek))];
  const derivedDaysLabel = derivedOpeningDays.length === 7
    ? t('admin.settings.everyDay')
    : WEEK_ORDER.filter((d) => derivedOpeningDays.includes(d))
        .map((d) => t(`admin.settings.daysShort.${DAY_KEYS[d]}`))
        .join(', ');

  const formatClosureDates = (closure: Closure) => {
    const start = new Date(closure.startDate).toLocaleDateString();
    if (!closure.endDate) return `${start} (${t('admin.settings.closureSingleDay')})`;
    return `${start} → ${new Date(closure.endDate).toLocaleDateString()}`;
  };

  let parsedTiers: DurationTier[] = [];
  try {
    parsedTiers = systemConfig.booking_durations ? JSON.parse(systemConfig.booking_durations) : [];
  } catch {
    parsedTiers = [];
  }

  const INFO_KEYS = [
    'restaurant_name', 'restaurant_tagline', 'restaurant_address', 'restaurant_phone',
    'restaurant_email', 'social_instagram', 'social_facebook', 'maps_url', 'map_image',
    'timezone', 'currency', 'languages_supported', 'language_default',
  ];
  const BRAND_KEYS = [
    'brand_logo', 'theme_primary', 'theme_primary_light', 'theme_accent',
    'theme_accent_hover', 'theme_decor', 'font_heading', 'font_body', 'fonts_url',
  ];

  const infoRows: Array<{ label: string; key: string }> = [
    { label: t('admin.settings.nameLabel'), key: 'restaurant_name' },
    { label: t('admin.settings.taglineLabel'), key: 'restaurant_tagline' },
    { label: t('admin.settings.addressLabel'), key: 'restaurant_address' },
    { label: t('admin.settings.phoneLabel'), key: 'restaurant_phone' },
    { label: t('admin.settings.contactEmailLabel'), key: 'restaurant_email' },
    { label: t('admin.settings.timezoneLabel'), key: 'timezone' },
    { label: t('admin.settings.currencyLabel'), key: 'currency' },
    { label: t('admin.settings.languagesLabel'), key: 'languages_supported' },
    { label: t('admin.settings.defaultLanguageLabel'), key: 'language_default' },
  ];

  const infoFields: Array<{ label: string; key: string; type?: string; required?: boolean }> = [
    { label: t('admin.settings.restaurantName'), key: 'restaurant_name', required: true },
    { label: t('admin.settings.taglineLabel'), key: 'restaurant_tagline' },
    { label: t('admin.settings.addressLabel'), key: 'restaurant_address' },
    { label: t('admin.settings.phoneLabel'), key: 'restaurant_phone' },
    { label: t('admin.settings.contactEmailLabel'), key: 'restaurant_email', type: 'email' },
    { label: t('admin.settings.instagramLabel'), key: 'social_instagram' },
    { label: t('admin.settings.facebookLabel'), key: 'social_facebook' },
    { label: t('admin.settings.mapsUrlLabel'), key: 'maps_url' },
    { label: t('admin.settings.mapImageLabel'), key: 'map_image' },
    { label: t('admin.settings.timezoneLabel'), key: 'timezone' },
    { label: t('admin.settings.currencyLabel'), key: 'currency' },
    { label: t('admin.settings.languagesLabel'), key: 'languages_supported' },
    { label: t('admin.settings.defaultLanguageLabel'), key: 'language_default' },
  ];

  const brandColorFields: Array<{ label: string; key: string }> = [
    { label: t('admin.settings.colorPrimary'), key: 'theme_primary' },
    { label: t('admin.settings.colorPrimaryLight'), key: 'theme_primary_light' },
    { label: t('admin.settings.colorAccent'), key: 'theme_accent' },
    { label: t('admin.settings.colorAccentHover'), key: 'theme_accent_hover' },
    { label: t('admin.settings.colorDecor'), key: 'theme_decor' },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>{t('admin.settings.title')}</h1>
        <p>{t('admin.settings.subtitle')}</p>
      </div>

      {loadError && <div className="error-msg" role="alert" style={{ marginBottom: '1rem' }}>{loadError}</div>}

      <div className="config-grid">

        {/* Información del restaurante (M1) */}
        <div className="config-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, border: 'none', padding: 0 }}>🍽️ {t('admin.settings.restaurantInfo')}</h3>
          </div>

          {loading ? (
            <div className="state-loading"><span className="spinner">⌛</span></div>
          ) : (
            <>
              {infoRows.map((row) => (
                <div className="config-row" key={row.key}>
                  <span className="config-row__label">{row.label}</span>
                  <span className="config-row__value">{systemConfig[row.key] || '—'}</span>
                </div>
              ))}
              <button onClick={() => openConfigModal('info', INFO_KEYS)} style={buttonStyles.section}>
                ✏️ {t('admin.settings.editInfo')}
              </button>
            </>
          )}
        </div>

        {/* Marca y tema (M3) */}
        <div className="config-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, border: 'none', padding: 0 }}>🎨 {t('admin.settings.brandSection')}</h3>
          </div>

          {loading ? (
            <div className="state-loading"><span className="spinner">⌛</span></div>
          ) : (
            <>
              <div className="config-row">
                <span className="config-row__label">{t('admin.settings.logoLabel')}</span>
                <span className="config-row__value">{systemConfig.brand_logo || '—'}</span>
              </div>
              {brandColorFields.map((field) => (
                <div className="config-row" key={field.key}>
                  <span className="config-row__label">{field.label}</span>
                  <span className="config-row__value" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    {systemConfig[field.key] ? (
                      <>
                        <span style={{ width: '14px', height: '14px', borderRadius: '3px', background: systemConfig[field.key], border: '1px solid var(--border)', display: 'inline-block' }} />
                        {systemConfig[field.key]}
                      </>
                    ) : '—'}
                  </span>
                </div>
              ))}
              <div className="config-row">
                <span className="config-row__label">{t('admin.settings.fontHeadingLabel')}</span>
                <span className="config-row__value">{systemConfig.font_heading || '—'}</span>
              </div>
              <button onClick={() => openConfigModal('brand', BRAND_KEYS)} style={buttonStyles.section}>
                🎨 {t('admin.settings.editBrand')}
              </button>
            </>
          )}
        </div>

        {/* Turnos (M4: CRUD) */}
        <div className="config-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, border: 'none', padding: 0 }}>📅 {t('admin.settings.openingHours')}</h3>
            <button onClick={handleNewShiftClick} style={buttonStyles.small}>{t('admin.settings.newShift')}</button>
          </div>

          {loading ? (
            <div className="state-loading"><span className="spinner">⌛</span></div>
          ) : (
            <>
              <div className="config-row" style={{ backgroundColor: 'var(--bg-light)', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', border: '1px solid var(--border)' }}>
                <div>
                  <div className="config-row__label">📅 {t('admin.settings.weeklyOpeningDays')}</div>
                  <div className="config-row__value" style={{ marginTop: '0.5rem', fontWeight: 600, color: 'var(--primary)', fontSize: '1rem' }}>
                    {derivedDaysLabel || '—'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    {t('admin.settings.derivedFromShifts')}
                  </div>
                </div>
              </div>

              {shifts.length === 0 ? (
                <div className="state-empty">{t('admin.settings.noShifts')}</div>
              ) : (
                shifts.map((shift) => (
                  <div className="config-row" key={shift.id} style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div className="config-row__label">{shift.name} {shift.isActive ? '' : t('admin.settings.inactiveShift')}</div>
                      <div className="config-row__value" style={{ marginTop: '0.25rem' }}>
                        {t('admin.settings.shiftDetail', { start: shift.startTime, end: shift.endTime, interval: shift.slotInterval })}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        {WEEK_ORDER.filter((d) => shift.daysOfWeek.includes(d))
                          .map((d) => t(`admin.settings.daysShort.${DAY_KEYS[d]}`)).join(', ')}
                        {shift.maxBookingsPerSlot ? ` · ${t('admin.settings.maxPerSlotDetail', { n: shift.maxBookingsPerSlot })}` : ''}
                      </div>
                    </div>
                    <button onClick={() => handleEditShiftClick(shift)} style={buttonStyles.small}>
                      {t('admin.common.edit')}
                    </button>
                  </div>
                ))
              )}
            </>
          )}
        </div>

        {/* Reglas de reserva (M4) */}
        <div className="config-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, border: 'none', padding: 0 }}>📏 {t('admin.settings.rulesSection')}</h3>
          </div>

          {loading ? (
            <div className="state-loading"><span className="spinner">⌛</span></div>
          ) : (
            <>
              <div className="config-row">
                <span className="config-row__label">{t('admin.settings.durationsLabel')}</span>
                <span className="config-row__value">
                  {parsedTiers.length > 0
                    ? parsedTiers.map((tier) => `${tier.maxPax === null ? t('admin.settings.durationTierRest') : `≤${tier.maxPax}`}: ${tier.minutes}′`).join(' · ')
                    : '—'}
                </span>
              </div>
              <div className="config-row">
                <span className="config-row__label">{t('admin.settings.minHoursLabel')}</span>
                <span className="config-row__value">{systemConfig.booking_min_hours_ahead || '—'}</span>
              </div>
              <div className="config-row">
                <span className="config-row__label">{t('admin.settings.maxDaysLabel')}</span>
                <span className="config-row__value">{systemConfig.booking_max_days_ahead || '—'}</span>
              </div>
              <div className="config-row">
                <span className="config-row__label">{t('admin.settings.noShowLabel')}</span>
                <span className="config-row__value">{systemConfig.no_show_threshold || '—'}</span>
              </div>
              <div className="config-row">
                <span className="config-row__label">{t('admin.settings.paxMinLabel')}</span>
                <span className="config-row__value">{systemConfig.pax_min || '—'}</span>
              </div>
              <button onClick={openRulesModal} style={buttonStyles.section}>
                📏 {t('admin.settings.editRules')}
              </button>
            </>
          )}
        </div>

        {/* Automatizaciones (N1.2/N1.4/N3.4/N4.1/N3.2) */}
        <div className="config-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, border: 'none', padding: 0 }}>🤖 {t('admin.settings.automationsSection')}</h3>
          </div>
          {loading ? (
            <div className="state-loading"><span className="spinner">⌛</span></div>
          ) : (
            <>
              <div className="config-row">
                <span className="config-row__label">{t('admin.settings.autoReminders')}</span>
                <span className="config-row__value">
                  {(systemConfig.reminder_enabled ?? 'true') === 'true'
                    ? t('admin.settings.autoRemindersOn', { hours: systemConfig.reminder_hours_before || '24' })
                    : t('admin.settings.autoOff')}
                </span>
              </div>
              <div className="config-row">
                <span className="config-row__label">{t('admin.settings.autoWaitlist')}</span>
                <span className="config-row__value">
                  {(systemConfig.waitlist_enabled ?? 'true') === 'true' ? t('admin.settings.autoOn') : t('admin.settings.autoOff')}
                </span>
              </div>
              <div className="config-row">
                <span className="config-row__label">{t('admin.settings.autoReviews')}</span>
                <span className="config-row__value">
                  {systemConfig.review_request_enabled === 'true' ? t('admin.settings.autoOn') : t('admin.settings.autoOff')}
                </span>
              </div>
              <div className="config-row">
                <span className="config-row__label">{t('admin.settings.autoCaptcha')}</span>
                <span className="config-row__value">
                  {systemConfig.captcha_enabled === 'true' ? t('admin.settings.autoOn') : t('admin.settings.autoOff')}
                </span>
              </div>
              <button onClick={openAutomationsModal} style={buttonStyles.section}>
                🤖 {t('admin.settings.editAutomations')}
              </button>
            </>
          )}
        </div>

        {/* Cierres y festivos (M4) */}
        <div className="config-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, border: 'none', padding: 0 }}>🚫 {t('admin.settings.closuresSection')}</h3>
            <button onClick={openClosureModal} style={buttonStyles.small}>{t('admin.settings.addClosure')}</button>
          </div>

          {loading ? (
            <div className="state-loading"><span className="spinner">⌛</span></div>
          ) : closures.length === 0 ? (
            <div className="state-empty">{t('admin.settings.closuresEmpty')}</div>
          ) : (
            closures.map((closure) => (
              <div className="config-row" key={closure.id} style={{ alignItems: 'flex-start' }}>
                <div>
                  <div className="config-row__label">{closure.reason}</div>
                  <div className="config-row__value" style={{ marginTop: '0.25rem' }}>{formatClosureDates(closure)}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    {closure.shift ? closure.shift.name : t('admin.settings.closureAllShifts')}
                  </div>
                </div>
                <button onClick={() => handleDeleteClosure(closure)} style={buttonStyles.danger}>
                  {t('admin.common.delete')}
                </button>
              </div>
            ))
          )}
        </div>

        {/* Capacidad / Sistema */}
        <div className="config-section">
          <h3>🪑 {t('admin.settings.capacitySection')}</h3>
          <div className="config-row">
            <span className="config-row__label">{t('admin.settings.maxCapacity')}</span>
            <span className="config-row__value">{t('admin.settings.guestsValue', { n: systemConfig.dynamic_max_capacity || '—' })}</span>
          </div>
          <div className="config-row">
            <span className="config-row__label">{t('admin.settings.activeTables')}</span>
            <span className="config-row__value">{t('admin.settings.tablesValue', { n: systemConfig.dynamic_active_tables || '—' })}</span>
          </div>
          <h3 style={{ marginTop: '1.5rem' }}>🔧 {t('admin.settings.systemSection')}</h3>
          <div className="config-row">
            <span className="config-row__label">{t('admin.settings.environment')}</span>
            <span className="config-row__value">{import.meta.env.MODE}</span>
          </div>
          <div className="config-row">
            <span className="config-row__label">{t('admin.settings.timezone')}</span>
            <span className="config-row__value">{systemConfig.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
          </div>
        </div>
      </div>

      {/* Modal Shift (crear/editar) */}
      {editingShift && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal__header">
              <h2>{editingShift.id === null ? t('admin.settings.newShiftTitle') : t('admin.settings.editShiftTitle', { name: editingShift.name })}</h2>
              <button className="admin-modal__close" type="button" onClick={() => setEditingShift(null)}>×</button>
            </div>
            <div className="admin-modal__body">
              <form id="shift-form" onSubmit={handleSaveShift} className="admin-modal__form-group" style={{ gap: '1.25rem' }}>
                <div className="admin-modal__form-group">
                  <label>{t('admin.settings.shiftNameLabel')}</label>
                  <input
                    type="text"
                    required
                    placeholder={t('admin.settings.shiftNamePlaceholder')}
                    value={editingShift.name}
                    onChange={(e) => setEditingShift({ ...editingShift, name: e.target.value })}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="admin-modal__form-group">
                    <label>{t('admin.settings.startTime')}</label>
                    <input
                      type="time"
                      required
                      value={editingShift.startTime}
                      onChange={(e) => setEditingShift({ ...editingShift, startTime: e.target.value })}
                    />
                  </div>
                  <div className="admin-modal__form-group">
                    <label>{t('admin.settings.endTime')}</label>
                    <input
                      type="time"
                      required
                      value={editingShift.endTime}
                      onChange={(e) => setEditingShift({ ...editingShift, endTime: e.target.value })}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="admin-modal__form-group">
                    <label>{t('admin.settings.slotInterval')}</label>
                    <input
                      type="number"
                      required
                      min="15"
                      step="15"
                      value={editingShift.slotInterval}
                      onChange={(e) => setEditingShift({ ...editingShift, slotInterval: Number(e.target.value) })}
                    />
                  </div>
                  <div className="admin-modal__form-group">
                    <label>{t('admin.settings.maxPerSlotLabel')}</label>
                    <input
                      type="number"
                      min="1"
                      value={editingShift.maxBookingsPerSlot ?? ''}
                      onChange={(e) => setEditingShift({
                        ...editingShift,
                        maxBookingsPerSlot: e.target.value === '' ? null : Number(e.target.value),
                      })}
                    />
                  </div>
                </div>
                <div className="admin-modal__form-group">
                  <label>{t('admin.settings.shiftDaysLabel')}</label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                    {WEEK_ORDER.map((day) => {
                      const isSelected = editingShift.daysOfWeek.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleShiftDay(day)}
                          style={{
                            width: '40px', height: '40px', borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', border: '1px solid var(--border)',
                            background: isSelected ? 'var(--accent-action)' : 'transparent',
                            color: isSelected ? 'white' : 'inherit', fontWeight: 600,
                            transition: 'all 0.2s',
                          }}
                        >
                          {t(`admin.settings.daysLetter.${DAY_KEYS[day]}`)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={editingShift.isActive}
                    onChange={(e) => setEditingShift({ ...editingShift, isActive: e.target.checked })}
                    id="isActiveCheck"
                    style={{ width: 'auto' }}
                  />
                  <label htmlFor="isActiveCheck" style={{ margin: 0, cursor: 'pointer' }}>{t('admin.settings.shiftActive')}</label>
                </div>
              </form>
              {formError && <div className="error-msg" role="alert" style={{ marginTop: '0.75rem' }}>{formError}</div>}
            </div>
            <div className="admin-modal__footer">
              {editingShift.id !== null && (
                <button type="button" onClick={handleDeleteShift} disabled={saving} style={{ ...buttonStyles.danger, marginRight: 'auto' }}>
                  {t('admin.settings.deleteShift')}
                </button>
              )}
              <button type="button" onClick={() => setEditingShift(null)} style={buttonStyles.ghost}>
                {t('admin.common.cancel')}
              </button>
              <button type="submit" form="shift-form" disabled={saving} style={buttonStyles.primary}>
                {saving ? t('admin.common.saving') : t('admin.common.saveChanges')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Información / Marca */}
      {(activeModal === 'info' || activeModal === 'brand') && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="admin-modal__header">
              <h2>{activeModal === 'info' ? t('admin.settings.editInfo') : t('admin.settings.editBrand')}</h2>
              <button className="admin-modal__close" type="button" onClick={() => setActiveModal('')}>×</button>
            </div>
            <div className="admin-modal__body">
              <form id="config-form" onSubmit={handleSaveConfig} className="admin-modal__form-group" style={{ gap: '1.25rem' }}>
                {activeModal === 'info' && infoFields.map((field) => (
                  <div className="admin-modal__form-group" key={field.key}>
                    <label>{field.label}</label>
                    <input
                      type={field.type || 'text'}
                      required={field.required}
                      value={configForm[field.key] || ''}
                      onChange={(e) => setConfigForm({ ...configForm, [field.key]: e.target.value })}
                    />
                  </div>
                ))}
                {activeModal === 'brand' && (
                  <>
                    <div className="admin-modal__form-group">
                      <label>{t('admin.settings.logoLabel')}</label>
                      <input
                        type="text"
                        value={configForm.brand_logo || ''}
                        onChange={(e) => setConfigForm({ ...configForm, brand_logo: e.target.value })}
                      />
                    </div>
                    {brandColorFields.map((field) => (
                      <div className="admin-modal__form-group" key={field.key}>
                        <label>{field.label}</label>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <input
                            type="color"
                            value={configForm[field.key] || '#000000'}
                            onChange={(e) => setConfigForm({ ...configForm, [field.key]: e.target.value })}
                            style={{ width: '48px', height: '36px', padding: '2px' }}
                          />
                          <input
                            type="text"
                            value={configForm[field.key] || ''}
                            onChange={(e) => setConfigForm({ ...configForm, [field.key]: e.target.value })}
                            style={{ flex: 1 }}
                          />
                        </div>
                      </div>
                    ))}
                    <div className="admin-modal__form-group">
                      <label>{t('admin.settings.fontHeadingLabel')}</label>
                      <input
                        type="text"
                        value={configForm.font_heading || ''}
                        onChange={(e) => setConfigForm({ ...configForm, font_heading: e.target.value })}
                      />
                    </div>
                    <div className="admin-modal__form-group">
                      <label>{t('admin.settings.fontBodyLabel')}</label>
                      <input
                        type="text"
                        value={configForm.font_body || ''}
                        onChange={(e) => setConfigForm({ ...configForm, font_body: e.target.value })}
                      />
                    </div>
                    <div className="admin-modal__form-group">
                      <label>{t('admin.settings.fontsUrlLabel')}</label>
                      <input
                        type="text"
                        value={configForm.fonts_url || ''}
                        onChange={(e) => setConfigForm({ ...configForm, fonts_url: e.target.value })}
                      />
                    </div>
                  </>
                )}
              </form>
              {formError && <div className="error-msg" role="alert" style={{ marginTop: '0.75rem' }}>{formError}</div>}
            </div>
            <div className="admin-modal__footer">
              <button type="button" onClick={() => setActiveModal('')} style={buttonStyles.ghost}>
                {t('admin.common.cancel')}
              </button>
              <button type="submit" form="config-form" disabled={saving} style={buttonStyles.primary}>
                {saving ? t('admin.common.saving') : t('admin.common.saveChanges')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Reglas de reserva (M4) */}
      {activeModal === 'rules' && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="admin-modal__header">
              <h2>{t('admin.settings.rulesSection')}</h2>
              <button className="admin-modal__close" type="button" onClick={() => setActiveModal('')}>×</button>
            </div>
            <div className="admin-modal__body">
              <form id="rules-form" onSubmit={handleSaveRules} className="admin-modal__form-group" style={{ gap: '1.25rem' }}>
                <div className="admin-modal__form-group">
                  <label>{t('admin.settings.durationsLabel')}</label>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    {t('admin.settings.durationsHelp')}
                  </div>
                  {rulesForm.tiers.map((tier, index) => (
                    <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <input
                        type="number"
                        min="1"
                        placeholder={t('admin.settings.durationTierRest')}
                        aria-label={t('admin.settings.durationTierMax')}
                        value={tier.maxPax ?? ''}
                        onChange={(e) => {
                          const tiers = [...rulesForm.tiers];
                          tiers[index] = { ...tier, maxPax: e.target.value === '' ? null : Number(e.target.value) };
                          setRulesForm({ ...rulesForm, tiers });
                        }}
                        style={{ width: '110px' }}
                      />
                      <span>→</span>
                      <input
                        type="number"
                        min="1"
                        required
                        aria-label={t('admin.settings.durationTierMinutes')}
                        value={tier.minutes}
                        onChange={(e) => {
                          const tiers = [...rulesForm.tiers];
                          tiers[index] = { ...tier, minutes: Number(e.target.value) };
                          setRulesForm({ ...rulesForm, tiers });
                        }}
                        style={{ width: '110px' }}
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('admin.settings.durationTierMinutes')}</span>
                      <button
                        type="button"
                        onClick={() => setRulesForm({ ...rulesForm, tiers: rulesForm.tiers.filter((_, i) => i !== index) })}
                        style={{ ...buttonStyles.danger, padding: '0.25rem 0.5rem' }}
                      >
                        {t('admin.settings.removeTier')}
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setRulesForm({ ...rulesForm, tiers: [...rulesForm.tiers, { maxPax: null, minutes: 90 }] })}
                    style={{ ...buttonStyles.ghost, padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                  >
                    {t('admin.settings.addTier')}
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="admin-modal__form-group">
                    <label>{t('admin.settings.minHoursLabel')}</label>
                    <input type="number" min="0" required value={rulesForm.minHours}
                      onChange={(e) => setRulesForm({ ...rulesForm, minHours: e.target.value })} />
                  </div>
                  <div className="admin-modal__form-group">
                    <label>{t('admin.settings.maxDaysLabel')}</label>
                    <input type="number" min="1" required value={rulesForm.maxDays}
                      onChange={(e) => setRulesForm({ ...rulesForm, maxDays: e.target.value })} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="admin-modal__form-group">
                    <label>{t('admin.settings.offsetsLabel')}</label>
                    <input type="text" required value={rulesForm.offsets}
                      onChange={(e) => setRulesForm({ ...rulesForm, offsets: e.target.value })} />
                  </div>
                  <div className="admin-modal__form-group">
                    <label>{t('admin.settings.maxSuggestionsLabel')}</label>
                    <input type="number" min="1" required value={rulesForm.maxSuggestions}
                      onChange={(e) => setRulesForm({ ...rulesForm, maxSuggestions: e.target.value })} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="admin-modal__form-group">
                    <label>{t('admin.settings.noShowLabel')}</label>
                    <input type="number" min="1" required value={rulesForm.noShow}
                      onChange={(e) => setRulesForm({ ...rulesForm, noShow: e.target.value })} />
                  </div>
                  <div className="admin-modal__form-group">
                    <label>{t('admin.settings.paxMinLabel')}</label>
                    <input type="number" min="1" required value={rulesForm.paxMin}
                      onChange={(e) => setRulesForm({ ...rulesForm, paxMin: e.target.value })} />
                  </div>
                </div>
              </form>
              {formError && <div className="error-msg" role="alert" style={{ marginTop: '0.75rem' }}>{formError}</div>}
            </div>
            <div className="admin-modal__footer">
              <button type="button" onClick={() => setActiveModal('')} style={buttonStyles.ghost}>
                {t('admin.common.cancel')}
              </button>
              <button type="submit" form="rules-form" disabled={saving} style={buttonStyles.primary}>
                {saving ? t('admin.common.saving') : t('admin.common.saveChanges')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cierre (M4) */}
      {activeModal === 'automations' && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal__header">
              <h2>🤖 {t('admin.settings.automationsSection')}</h2>
              <button className="admin-modal__close" type="button" onClick={() => setActiveModal('')}>×</button>
            </div>
            <div className="admin-modal__body">
              <form id="automations-form" onSubmit={handleSaveAutomations} className="admin-modal__form-group" style={{ gap: '1.25rem' }}>
                <fieldset style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '0.75rem 1rem' }}>
                  <legend style={{ fontSize: '0.85rem', fontWeight: 700 }}>⏰ {t('admin.settings.autoReminders')}</legend>
                  <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input type="checkbox" checked={autoForm.reminderEnabled} onChange={(e) => setAutoForm({ ...autoForm, reminderEnabled: e.target.checked })} />
                    {t('admin.settings.reminderEnabledLabel')}
                  </label>
                  <div className="admin-modal__form-group" style={{ marginTop: '0.6rem' }}>
                    <label>{t('admin.settings.reminderHoursLabel')}</label>
                    <input type="number" min={1} value={autoForm.reminderHours} onChange={(e) => setAutoForm({ ...autoForm, reminderHours: e.target.value })} />
                  </div>
                  <div className="admin-modal__form-group">
                    <label>{t('admin.settings.reminderPolicyLabel')}</label>
                    <select value={autoForm.reminderPolicy} onChange={(e) => setAutoForm({ ...autoForm, reminderPolicy: e.target.value })}>
                      <option value="notify">{t('admin.settings.reminderPolicyNotify')}</option>
                      <option value="autocancel">{t('admin.settings.reminderPolicyAutocancel')}</option>
                    </select>
                  </div>
                  {autoForm.reminderPolicy === 'autocancel' && (
                    <div className="admin-modal__form-group">
                      <label>{t('admin.settings.reminderAutocancelHoursLabel')}</label>
                      <input type="number" min={1} value={autoForm.reminderAutocancelHours} onChange={(e) => setAutoForm({ ...autoForm, reminderAutocancelHours: e.target.value })} />
                    </div>
                  )}
                </fieldset>

                <fieldset style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '0.75rem 1rem' }}>
                  <legend style={{ fontSize: '0.85rem', fontWeight: 700 }}>🕐 {t('admin.settings.autoWaitlist')}</legend>
                  <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input type="checkbox" checked={autoForm.waitlistEnabled} onChange={(e) => setAutoForm({ ...autoForm, waitlistEnabled: e.target.checked })} />
                    {t('admin.settings.waitlistEnabledLabel')}
                  </label>
                  <div className="admin-modal__form-group" style={{ marginTop: '0.6rem' }}>
                    <label>{t('admin.settings.waitlistHoldHoursLabel')}</label>
                    <input type="number" min={1} value={autoForm.waitlistHoldHours} onChange={(e) => setAutoForm({ ...autoForm, waitlistHoldHours: e.target.value })} />
                  </div>
                </fieldset>

                <fieldset style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '0.75rem 1rem' }}>
                  <legend style={{ fontSize: '0.85rem', fontWeight: 700 }}>⭐ {t('admin.settings.autoReviews')}</legend>
                  <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input type="checkbox" checked={autoForm.reviewEnabled} onChange={(e) => setAutoForm({ ...autoForm, reviewEnabled: e.target.checked })} />
                    {t('admin.settings.reviewEnabledLabel')}
                  </label>
                  <div className="admin-modal__form-group" style={{ marginTop: '0.6rem' }}>
                    <label>{t('admin.settings.reviewMinDaysLabel')}</label>
                    <input type="number" min={1} value={autoForm.reviewMinDays} onChange={(e) => setAutoForm({ ...autoForm, reviewMinDays: e.target.value })} />
                  </div>
                </fieldset>

                <fieldset style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '0.75rem 1rem' }}>
                  <legend style={{ fontSize: '0.85rem', fontWeight: 700 }}>🛡️ {t('admin.settings.autoProtection')}</legend>
                  <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input type="checkbox" checked={autoForm.zoneSelectionEnabled} onChange={(e) => setAutoForm({ ...autoForm, zoneSelectionEnabled: e.target.checked })} />
                    {t('admin.settings.zoneSelectionLabel')}
                  </label>
                  <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                    <input type="checkbox" checked={autoForm.captchaEnabled} onChange={(e) => setAutoForm({ ...autoForm, captchaEnabled: e.target.checked })} />
                    {t('admin.settings.captchaEnabledLabel')}
                  </label>
                  {autoForm.captchaEnabled && (
                    <>
                      <div className="admin-modal__form-group" style={{ marginTop: '0.6rem' }}>
                        <label>{t('admin.settings.captchaSiteKeyLabel')}</label>
                        <input type="text" value={autoForm.captchaSiteKey} onChange={(e) => setAutoForm({ ...autoForm, captchaSiteKey: e.target.value })} />
                      </div>
                      <div className="admin-modal__form-group">
                        <label>{t('admin.settings.captchaSecretKeyLabel')}</label>
                        <input type="password" value={autoForm.captchaSecretKey} onChange={(e) => setAutoForm({ ...autoForm, captchaSecretKey: e.target.value })} autoComplete="new-password" />
                      </div>
                    </>
                  )}
                </fieldset>
              </form>
              {formError && <div className="error-msg" role="alert" style={{ marginTop: '0.75rem' }}>{formError}</div>}
            </div>
            <div className="admin-modal__footer">
              <button type="button" onClick={() => setActiveModal('')} style={buttonStyles.ghost}>
                {t('admin.common.cancel')}
              </button>
              <button type="submit" form="automations-form" disabled={saving} style={buttonStyles.primary}>
                {saving ? t('admin.common.saving') : t('admin.common.saveChanges')}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'closure' && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal__header">
              <h2>{t('admin.settings.newClosureTitle')}</h2>
              <button className="admin-modal__close" type="button" onClick={() => setActiveModal('')}>×</button>
            </div>
            <div className="admin-modal__body">
              <form id="closure-form" onSubmit={handleSaveClosure} className="admin-modal__form-group" style={{ gap: '1.25rem' }}>
                <div className="admin-modal__form-group">
                  <label>{t('admin.settings.closureReason')}</label>
                  <input
                    type="text"
                    required
                    placeholder={t('admin.settings.closureReasonPlaceholder')}
                    value={closureForm.reason}
                    onChange={(e) => setClosureForm({ ...closureForm, reason: e.target.value })}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="admin-modal__form-group">
                    <label>{t('admin.settings.closureStart')}</label>
                    <input
                      type="date"
                      required
                      value={closureForm.startDate}
                      onChange={(e) => setClosureForm({ ...closureForm, startDate: e.target.value })}
                    />
                  </div>
                  <div className="admin-modal__form-group">
                    <label>{t('admin.settings.closureEnd')}</label>
                    <input
                      type="date"
                      value={closureForm.endDate}
                      onChange={(e) => setClosureForm({ ...closureForm, endDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="admin-modal__form-group">
                  <label>{t('admin.settings.closureShift')}</label>
                  <select
                    value={closureForm.shiftId}
                    onChange={(e) => setClosureForm({ ...closureForm, shiftId: e.target.value })}
                  >
                    <option value="">{t('admin.settings.closureAllShifts')}</option>
                    {shifts.map((shift) => (
                      <option key={shift.id} value={shift.id}>{shift.name}</option>
                    ))}
                  </select>
                </div>
                {/* N1.3: cierre sobrevenido — cancelar y avisar por email a las reservas afectadas */}
                <div className="admin-modal__form-group" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="closure-notify"
                    checked={closureForm.notifyAffected}
                    onChange={(e) => setClosureForm({ ...closureForm, notifyAffected: e.target.checked })}
                    style={{ marginTop: '0.2rem' }}
                  />
                  <label htmlFor="closure-notify" style={{ fontWeight: 'normal' }}>
                    {t('admin.settings.closureNotifyAffected')}
                  </label>
                </div>
              </form>
              {formError && <div className="error-msg" role="alert" style={{ marginTop: '0.75rem' }}>{formError}</div>}
            </div>
            <div className="admin-modal__footer">
              <button type="button" onClick={() => setActiveModal('')} style={buttonStyles.ghost}>
                {t('admin.common.cancel')}
              </button>
              <button type="submit" form="closure-form" disabled={saving} style={buttonStyles.primary}>
                {saving ? t('admin.common.saving') : t('admin.common.saveChanges')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
