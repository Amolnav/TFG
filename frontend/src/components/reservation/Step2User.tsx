
import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { createReservation } from '../../services/api';
import { getBaseLanguage } from '../../utils/i18n';
import { translateApiError } from '../../utils/apiErrors';
import { useConfig } from '../../context/useConfig';
import TurnstileWidget from './TurnstileWidget';
import type { ReservationConfirmation } from '../../types';

interface Props {
  bookingData: { date: string; time: string; pax: number; zoneId?: number };
  onNext: (confirmation: ReservationConfirmation) => void;
  onBack: () => void;
}

// BUG-43: validación cliente alineada con la del backend
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_FORMAT = /^\+?\d{9,15}$/;

export default function Step2User({ bookingData, onNext, onBack }: Props) {
  const { t, i18n } = useTranslation();
  const { config } = useConfig();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [allergies, setAllergies] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // N4.1: captcha Turnstile activable por configuración
  const captchaActive = config.captcha_enabled === 'true' && Boolean(config.captcha_site_key);
  const [captchaToken, setCaptchaToken] = useState('');
  // BUG-43: guardia de reentrada — un doble clic antes del re-render podía
  // disparar createReservation dos veces y duplicar la reserva
  const submittingRef = useRef(false);

  const validate = (): string => {
    if (!firstName.trim()) return t('reservation.errorFirstName');
    if (!lastName.trim()) return t('reservation.errorLastName');
    if (!email.trim() || !EMAIL_FORMAT.test(email.trim())) return t('reservation.errorEmail');
    if (!PHONE_FORMAT.test(phone.replace(/[\s\-()]/g, ''))) return t('reservation.errorPhone');
    if (captchaActive && !captchaToken) return t('reservation.errorCaptcha');
    return '';
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    submittingRef.current = true;
    setError('');
    setLoading(true);
    try {
      const allergens = allergies.trim()
        ? allergies.split(',').map(s => s.trim()).filter(Boolean)
        : undefined;
      const result = await createReservation({
        date: bookingData.date,
        time: bookingData.time,
        pax: bookingData.pax,
        zoneId: bookingData.zoneId,
        specialRequests: specialRequests.trim() || undefined,
        captchaToken: captchaActive ? captchaToken : undefined,
        customer: {
          firstName,
          lastName,
          email,
          phone,
          allergens,
          // M5: se guarda el idioma con el que el cliente reservó para que
          // los emails le lleguen en su idioma
          language: getBaseLanguage(i18n.language)
        },
      });
      onNext(result);
    } catch (err: unknown) {
      // M5: los errores de la API se traducen por su código estable
      setError(translateApiError(err, 'reservation.errorCreate', t, i18n));
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="form-title">{t('reservation.step2Title')}</h2>
      <p className="form-subtitle">
        {t('reservation.step2SubtitlePrefix')} <strong>{bookingData.pax} {bookingData.pax === 1 ? t('reservation.person') : t('reservation.persons')}</strong> {t('reservation.step2SubtitleOn')}{' '}
        <strong>{new Date(bookingData.date + 'T00:00:00').toLocaleDateString(i18n.language || 'es', { weekday: 'long', day: 'numeric', month: 'long' })}</strong> {t('reservation.step2SubtitleAt')}{' '}
        <strong>{bookingData.time}</strong>.
      </p>

      <div className="form-grid">
        <div className="form-grid form-grid-2">
          <div className="form-group">
            <label htmlFor="u-firstname">{t('reservation.firstNameLabel')}</label>
            <input
              id="u-firstname"
              type="text"
              placeholder={t('reservation.firstNamePlaceholder')}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="u-lastname">{t('reservation.lastNameLabel')}</label>
            <input
              id="u-lastname"
              type="text"
              placeholder={t('reservation.lastNamePlaceholder')}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="u-email">{t('reservation.emailLabel')}</label>
          <input
            id="u-email"
            type="email"
            placeholder={t('reservation.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="u-phone">{t('reservation.phoneLabel')}</label>
          <input
            id="u-phone"
            type="tel"
            placeholder={t('reservation.phonePlaceholder')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="u-allergies">{t('reservation.allergiesLabel')}</label>
          <textarea
            id="u-allergies"
            placeholder={t('reservation.allergiesPlaceholder')}
            value={allergies}
            onChange={(e) => setAllergies(e.target.value)}
            rows={2}
          />
        </div>

        <div className="form-group">
          <label htmlFor="u-requests">{t('reservation.requestsLabel')}</label>
          <textarea
            id="u-requests"
            placeholder={t('reservation.requestsPlaceholder')}
            value={specialRequests}
            onChange={(e) => setSpecialRequests(e.target.value)}
            rows={2}
          />
        </div>

        {captchaActive && (
          <div className="form-group">
            <TurnstileWidget siteKey={config.captcha_site_key} onToken={setCaptchaToken} />
          </div>
        )}

        {error && <div className="error-msg">{error}</div>}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={onBack}
            disabled={loading}
            style={{ flex: '0 0 auto', padding: '0.75rem 1.25rem' }}
          >
            {t('reservation.backBtn')}
          </button>
          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? t('reservation.confirmLoading') : t('reservation.confirmBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
