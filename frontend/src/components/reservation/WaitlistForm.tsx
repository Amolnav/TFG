
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '../../utils/apiErrors';

// N1.4: mini-formulario "Avísame si queda libre" para días completos.

interface JoinPayload {
  date: string;
  pax: number;
  customer: { firstName: string; lastName: string; email: string; phone: string };
}

interface Props {
  date: string;
  pax: number;
  onClose: () => void;
  onJoin: (payload: JoinPayload) => Promise<{ alreadyJoined: boolean }>;
}

export default function WaitlistForm({ date, pax, onClose, onJoin }: Props) {
  const { t, i18n } = useTranslation();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [joined, setJoined] = useState<null | { alreadyJoined: boolean }>(null);

  const formattedDate = new Date(`${date}T00:00:00`).toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const result = await onJoin({
        date,
        pax,
        customer: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
        },
      });
      setJoined(result);
    } catch (err) {
      setError(translateApiError(err, 'reservation.waitlistError', t, i18n));
    } finally {
      setSending(false);
    }
  };

  if (joined) {
    return (
      <div className="waitlist-box" data-joined="true">
        <p className="waitlist-box__title">
          ✅ {joined.alreadyJoined ? t('reservation.waitlistAlready') : t('reservation.waitlistJoined')}
        </p>
        <p className="waitlist-box__text">{t('reservation.waitlistJoinedText')}</p>
      </div>
    );
  }

  return (
    <div className="waitlist-box">
      <p className="waitlist-box__title">🕐 {t('reservation.waitlistFull', { date: formattedDate })}</p>
      <p className="waitlist-box__text">{t('reservation.waitlistOffer')}</p>
      <form onSubmit={handleSubmit} className="form-grid">
        <div className="form-grid form-grid-2">
          <div className="form-group">
            <label htmlFor="wl-firstname">{t('reservation.firstNameLabel')}</label>
            <input
              id="wl-firstname"
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="wl-lastname">{t('reservation.lastNameLabel')}</label>
            <input
              id="wl-lastname"
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>
        <div className="form-grid form-grid-2">
          <div className="form-group">
            <label htmlFor="wl-email">{t('reservation.emailLabel')}</label>
            <input
              id="wl-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="wl-phone">{t('reservation.phoneLabel')}</label>
            <input
              id="wl-phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>

        {error && <div className="error-msg">{error}</div>}

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={sending}>
            {t('admin.common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={sending}>
            {sending ? t('reservation.waitlistSending') : t('reservation.waitlistJoinBtn')}
          </button>
        </div>
      </form>
    </div>
  );
}
