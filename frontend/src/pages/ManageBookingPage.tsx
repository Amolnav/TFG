
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import AvailabilityCalendar from '../components/reservation/AvailabilityCalendar';
import {
  getManagedBooking,
  cancelManagedBooking,
  rescheduleManagedBooking,
  getAvailableTimes,
} from '../services/api';
import type { ManagedBookingData } from '../services/api';
import { translateApiError } from '../utils/apiErrors';
import type { TimeSlot } from '../types';
import '../styles/pages/ReservationPage.css';

// N1.1: página pública de autogestión /reserva/:token (sin login). El token
// es la capacidad de acceso; la API devuelve la PII enmascarada.
export default function ManageBookingPage() {
  const { token = '' } = useParams();
  const { t, i18n } = useTranslation();

  const [data, setData] = useState<ManagedBookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [rescheduled, setRescheduled] = useState(false);

  // Cambio de fecha/hora
  const [showReschedule, setShowReschedule] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getManagedBooking(token)
      .then((payload) => {
        setData(payload);
        setNotFound(false);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCancel = async () => {
    if (!window.confirm(t('manage.cancelConfirm'))) return;
    setWorking(true);
    setError('');
    try {
      await cancelManagedBooking(token);
      setCancelled(true);
    } catch (err) {
      setError(translateApiError(err, 'manage.cancelError', t, i18n));
    } finally {
      setWorking(false);
    }
  };

  const handlePickDate = (date: string) => {
    setNewDate(date);
    setNewTime('');
    setSlots([]);
    if (!data) return;
    setLoadingSlots(true);
    getAvailableTimes(date, data.booking.pax)
      .then(setSlots)
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  };

  const handleReschedule = async () => {
    if (!newDate || !newTime) return;
    setWorking(true);
    setError('');
    try {
      const payload = await rescheduleManagedBooking(token, { date: newDate, time: newTime });
      setData(payload);
      setShowReschedule(false);
      setRescheduled(true);
      setNewDate('');
      setNewTime('');
    } catch (err) {
      setError(translateApiError(err, 'manage.rescheduleError', t, i18n));
    } finally {
      setWorking(false);
    }
  };

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
              <div className="time-slots-loading"><span>⏳</span> {t('manage.loading')}</div>
            )}

            {!loading && notFound && (
              <div>
                <h2 className="form-title">{t('manage.notFoundTitle')}</h2>
                <p className="form-subtitle">{t('manage.notFoundText')}</p>
                <Link className="btn btn-primary" to="/reservar">{t('manage.bookAgain')}</Link>
              </div>
            )}

            {!loading && !notFound && data && cancelled && (
              <div className="success-panel">
                <div className="success-icon">✅</div>
                <h2 className="success-title">{t('manage.cancelledTitle')}</h2>
                <p className="form-subtitle">{t('manage.cancelledText')}</p>
                <Link className="btn btn-primary" to="/reservar">{t('manage.bookAgain')}</Link>
              </div>
            )}

            {!loading && !notFound && data && !cancelled && (
              <div>
                <h2 className="form-title">{t('manage.title')}</h2>
                <p className="form-subtitle">
                  {t('manage.greeting', { name: data.customer.firstName })}
                </p>

                {rescheduled && (
                  <div className="manage-success-note">✅ {t('manage.rescheduledText')}</div>
                )}

                <div className="success-details-card" style={{ margin: '1rem 0' }}>
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
                  {data.booking.table && (
                    <div className="success-details-row">
                      <span className="icon">🍽️</span>
                      <span className="label">{t('reservation.tableLabel')}</span>
                      <span className="value">
                        {data.booking.table.name}
                        {data.booking.table.zone ? ` — ${data.booking.table.zone}` : ''}
                      </span>
                    </div>
                  )}
                  <div className="success-details-row">
                    <span className="icon">✉️</span>
                    <span className="label">{t('manage.contactLabel')}</span>
                    <span className="value">{data.customer.emailMasked} · {data.customer.phoneMasked}</span>
                  </div>
                </div>

                {!data.canManage && (
                  <div>
                    <p className="form-subtitle">{t('manage.notManageable')}</p>
                    <Link className="btn btn-primary" to="/reservar">{t('manage.bookAgain')}</Link>
                  </div>
                )}

                {data.canManage && !showReschedule && (
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setShowReschedule(true)}
                      disabled={working}
                    >
                      🕐 {t('manage.changeBtn')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary manage-cancel-btn"
                      onClick={handleCancel}
                      disabled={working}
                    >
                      {working ? t('manage.working') : `✖ ${t('manage.cancelBtn')}`}
                    </button>
                  </div>
                )}

                {data.canManage && showReschedule && (
                  <div className="form-grid" style={{ marginTop: '0.5rem' }}>
                    <span className="time-slots-label">{t('manage.chooseNewDate')}</span>
                    <AvailabilityCalendar value={newDate} pax={data.booking.pax} onSelect={handlePickDate} />

                    {newDate && (
                      <div>
                        <span className="time-slots-label">{t('reservation.timeLabel')}</span>
                        {loadingSlots && (
                          <div className="time-slots-loading"><span>⏳</span> {t('reservation.loadingSlots')}</div>
                        )}
                        {!loadingSlots && slots.length === 0 && (
                          <div className="time-slots-empty">{t('reservation.errorNoSlots')}</div>
                        )}
                        {!loadingSlots && slots.length > 0 && (
                          <div className="time-slots-grid">
                            {slots.map((slot) => (
                              <button
                                key={slot.time}
                                type="button"
                                className={`time-slot-btn${newTime === slot.time ? ' selected' : ''}`}
                                onClick={() => setNewTime(slot.time)}
                              >
                                {slot.time}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => { setShowReschedule(false); setNewDate(''); setNewTime(''); }}
                        disabled={working}
                      >
                        {t('manage.backBtn')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleReschedule}
                        disabled={working || !newDate || !newTime}
                      >
                        {working ? t('manage.working') : t('manage.confirmChange')}
                      </button>
                    </div>
                  </div>
                )}

                {error && <div className="error-msg" style={{ marginTop: '0.75rem' }}>{error}</div>}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
