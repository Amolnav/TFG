
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import { reconfirmBooking } from '../services/api';
import type { ManagedBookingData } from '../services/api';
import '../styles/pages/ReservationPage.css';

// N1.2: página del enlace "Confirmo mi asistencia" del email de recordatorio.
// Al montarse reconfirma la reserva (el endpoint es idempotente).
export default function ReconfirmPage() {
  const { token = '' } = useParams();
  const { t, i18n } = useTranslation();

  const [data, setData] = useState<ManagedBookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    // Guardia de StrictMode: el POST solo se dispara una vez
    if (firedRef.current) return;
    firedRef.current = true;
    reconfirmBooking(token)
      .then((payload) => setData(payload))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [token]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="reservation-page">
      <Navbar isReservation={true} />
      <main className="reservation-container">
        <div className="reservation-card manage-card">
          <div className="reservation-form-panel" style={{ width: '100%' }}>
            {loading && (
              <div className="time-slots-loading"><span>⏳</span> {t('reconfirm.loading')}</div>
            )}

            {!loading && failed && (
              <div>
                <h2 className="form-title">{t('reconfirm.errorTitle')}</h2>
                <p className="form-subtitle">{t('reconfirm.errorText')}</p>
                <Link className="btn btn-primary" to="/reservar">{t('manage.bookAgain')}</Link>
              </div>
            )}

            {!loading && !failed && data && (
              <div className="success-panel">
                <div className="success-icon">🙌</div>
                <h2 className="success-title">{t('reconfirm.title')}</h2>
                <p className="form-subtitle">{t('reconfirm.text', { name: data.customer.firstName })}</p>
                <div className="success-details-card">
                  <div className="success-details-row">
                    <span className="icon">📅</span>
                    <span className="label">{t('reservation.dateLabel')}</span>
                    <span className="value" style={{ textTransform: 'capitalize' }}>{formatDate(data.booking.date)}</span>
                  </div>
                  <div className="success-details-row">
                    <span className="icon">🕐</span>
                    <span className="label">{t('reservation.timeLabel')}</span>
                    <span className="value">{formatTime(data.booking.date)}</span>
                  </div>
                  <div className="success-details-row">
                    <span className="icon">👥</span>
                    <span className="label">{t('reservation.paxLabel')}</span>
                    <span className="value">
                      {data.booking.pax} {data.booking.pax === 1 ? t('reservation.person') : t('reservation.persons')}
                    </span>
                  </div>
                </div>
                <Link className="btn btn-outline" to="/">{t('reservation.backHomeBtn')}</Link>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
