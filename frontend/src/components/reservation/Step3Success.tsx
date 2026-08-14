import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useConfig } from '../../context/useConfig';
import type { ReservationConfirmation } from '../../types';

interface Props {
  confirmation: ReservationConfirmation;
  bookingData: { date: string; time: string; pax: number };
  onRestart: () => void;
}

export default function Step3Success({ confirmation, bookingData, onRestart }: Props) {
  const { t, i18n } = useTranslation();
  const { config } = useConfig();
  const { booking, customer, table } = confirmation;

  // BUG-44: se formatea la fecha/hora que el usuario SELECCIONÓ (hora local
  // del restaurante), no booking.date convertido a la TZ del navegador: un
  // cliente con el dispositivo en otra zona horaria veía una hora distinta.
  const formattedDate = new Date(`${bookingData.date}T00:00:00`).toLocaleDateString(i18n.language || 'es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const formattedTime = bookingData.time;

  return (
    <div className="success-panel">
      <div className="success-icon">🎉</div>

      <div>
        <h2 className="success-title">{t('reservation.step3Title')}</h2>
        <p className="success-subtitle">
          {customer.isReturningCustomer
            ? t('reservation.step3SubtitleReturning', { name: customer.name.split(' ')[0] })
            : t('reservation.step3SubtitleNew', { name: customer.name.split(' ')[0], email: customer.email })}
        </p>
      </div>

      <div className="success-details-card">
        <div className="success-details-row">
          <span className="icon">📅</span>
          <span className="label">{t('reservation.dateLabel')}</span>
          <span className="value" style={{ textTransform: 'capitalize' }}>{formattedDate}</span>
        </div>
        <div className="success-details-row">
          <span className="icon">🕐</span>
          <span className="label">{t('reservation.timeLabel')}</span>
          <span className="value">{formattedTime}</span>
        </div>
        <div className="success-details-row">
          <span className="icon">👥</span>
          <span className="label">{t('reservation.paxLabel')}</span>
          <span className="value">{booking.pax} {booking.pax === 1 ? t('reservation.person') : t('reservation.persons')}</span>
        </div>
        <div className="success-details-row">
          <span className="icon">🍽️</span>
          <span className="label">{t('reservation.tableLabel')}</span>
          <span className="value">{table.name}{table.zone ? ` — ${table.zone}` : ''}</span>
        </div>
        {table.note && (
          <div className="success-details-row">
            <span className="icon">ℹ️</span>
            <span className="label">{t('reservation.noteLabel')}</span>
            <span className="value">{table.note}</span>
          </div>
        )}
      </div>

      <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--badge-vip-bg)', border: '1px solid var(--badge-vip-border)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
        {/* N1.1: autogestión por enlace; el teléfono de config queda como fallback */}
        {booking.manageToken ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--badge-vip-text)', margin: 0, fontWeight: 500 }}>
            {t('reservation.manageHint')}{' '}
            <Link to={`/reserva/${booking.manageToken}`} style={{ color: 'inherit', fontWeight: 700 }}>
              {t('reservation.manageLink')}
            </Link>
          </p>
        ) : (
          <p style={{ fontSize: '0.85rem', color: 'var(--badge-vip-text)', margin: 0, fontWeight: 500 }}>
            {/* BUG-44: el teléfono sale de la configuración, no hardcodeado */}
            {t('reservation.modifyOrCancel')} <strong>{config.restaurant_phone}</strong>
          </p>
        )}
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '320px', marginTop: '1rem' }}>
        {t('reservation.emailSent')} <strong>{customer.email}</strong>.
      </p>

      <button type="button" className="btn btn-outline w-full" onClick={onRestart}>
        {t('reservation.backHomeBtn')}
      </button>
    </div>
  );
}
