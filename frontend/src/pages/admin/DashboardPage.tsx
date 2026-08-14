
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getDashboard } from '../../services/api';
import { useSocket } from '../../context/useSocket';
import { useConfig } from '../../context/useConfig';
import type { DashboardData, BookingStatus, NewReservationEventPayload } from '../../types';
import { STATUS_BADGE_CLASS, STATUS_COLORS, getStatusLabel } from '../../constants/reservationStatus';
import '../../styles/pages/admin/AdminPages.css';

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  // M1: el subtítulo interpola el nombre configurado del restaurante
  const { config } = useConfig();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState<string | null>(null);
  const { socket } = useSocket();
  // BUG-49: descarta respuestas fuera de orden cuando llegan varios eventos
  const requestIdRef = useRef(0);

  // BUG-49: los refrescos disparados por sockets son silenciosos — antes cada
  // reserva entrante sustituía la tabla entera por "Cargando..." (parpadeo)
  const fetchDashboard = useCallback(async (silent = false) => {
    const requestId = ++requestIdRef.current;
    if (!silent) setLoading(true);
    try {
      const dashboard = await getDashboard();
      if (requestId !== requestIdRef.current) return;
      setData(dashboard);
      setError('');
    } catch {
      if (requestId !== requestIdRef.current) return;
      setError(t('admin.dashboard.loadError'));
    } finally {
      if (requestId === requestIdRef.current && !silent) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    if (!socket) return undefined;

    const handleNewReservation = (payload: NewReservationEventPayload) => {
      setNotification(
        payload.zoneName
          ? t('admin.dashboard.newReservationInZone', { name: payload.customerName, pax: payload.pax, zone: payload.zoneName })
          : t('admin.dashboard.newReservation', { name: payload.customerName, pax: payload.pax })
      );
      fetchDashboard(true);
    };

    // BUG-18: el panel también se refresca con cambios de estado, ediciones
    // y cancelaciones hechas desde otros puestos
    const handleChange = () => fetchDashboard(true);

    // N1.2: aviso del scheduler cuando una reserva cercana no se ha reconfirmado
    const handleReconfirmationPending = (payload: { customerName?: string | null; pax: number }) => {
      setNotification(
        t('admin.dashboard.reconfirmationPending', { name: payload.customerName || '—', pax: payload.pax })
      );
    };

    socket.on('new_reservation', handleNewReservation);
    socket.on('reservation_updated', handleChange);
    socket.on('reservation_status_changed', handleChange);
    socket.on('reservation_cancelled', handleChange);
    socket.on('reconfirmation_pending', handleReconfirmationPending);
    return () => {
      socket.off('new_reservation', handleNewReservation);
      socket.off('reservation_updated', handleChange);
      socket.off('reservation_status_changed', handleChange);
      socket.off('reservation_cancelled', handleChange);
      socket.off('reconfirmation_pending', handleReconfirmationPending);
    };
  }, [socket, fetchDashboard, t]);

  // BUG-49: la notificación de reserva entrante desaparece sola a los ~6 s
  useEffect(() => {
    if (!notification) return undefined;
    const timeoutId = setTimeout(() => setNotification(null), 6000);
    return () => clearTimeout(timeoutId);
  }, [notification]);

  if (loading) return (
    <div className="state-loading">
      <span className="spinner">⏳</span>
      {t('admin.dashboard.loading')}
    </div>
  );

  if (error) return (
    <div className="state-error">
      <span style={{ fontSize: '2rem' }}>⚠️</span>
      {error}
    </div>
  );

  if (!data) return null;

  const { summary, statusCounts, bookings } = data;

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>{t('admin.dashboard.title')}</h1>
          <p>{t('admin.dashboard.subtitle', { name: config.restaurant_name })}</p>
        </div>
        {/* N2.3: hoja de servicio imprimible del día */}
        <Link
          to="/admin/servicio"
          className="btn btn-primary"
          style={{ padding: '0.6rem 1.25rem', background: 'var(--accent-action)', color: 'white', borderRadius: '4px', fontWeight: 'bold', textDecoration: 'none' }}
        >
          🖨️ {t('admin.dashboard.printServiceBtn')}
        </Link>
      </div>

      {notification && (
        <div className="section-card section-card--alert" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <div>
              <strong>{t('admin.dashboard.liveNotification')}</strong> {notification}
            </div>
            <button
              className="btn btn-ghost"
              onClick={() => setNotification(null)}
              style={{ fontSize: '0.85rem', padding: '0.4rem 0.75rem' }}
            >
              {t('admin.common.close')}
            </button>
          </div>
        </div>
      )}

      {/* Widgets */}
      <div className="widgets-grid">
        <div className="widget-card accent-decor">
          <div className="widget-card__icon">📅</div>
          <div className="widget-card__label">{t('admin.dashboard.bookingsToday')}</div>
          <div className="widget-card__value">{summary.totalBookings}</div>
          <div className="widget-card__sub">{t('admin.dashboard.activeCount', { n: summary.activeBookings })}</div>
        </div>

        <div className="widget-card accent-primary">
          <div className="widget-card__icon">👥</div>
          <div className="widget-card__label">{t('admin.dashboard.expectedGuests')}</div>
          <div className="widget-card__value">{summary.totalPaxExpected}</div>
          <div className="widget-card__sub">{t('admin.dashboard.expectedGuestsSub')}</div>
        </div>

        <div className="widget-card accent-green">
          <div className="widget-card__icon">🍽️</div>
          <div className="widget-card__label">{t('admin.dashboard.currentCapacity')}</div>
          <div className="widget-card__value">{summary.occupancyRate}%</div>
          <div className="widget-card__sub">{t('admin.dashboard.tablesRatio', { active: summary.activeBookings, total: summary.totalTables })}</div>
          <div className="occupancy-bar">
            <div className="occupancy-bar__fill" style={{ width: `${summary.occupancyRate}%` }} />
          </div>
        </div>

        <div className="widget-card accent-action">
          <div className="widget-card__icon">📆</div>
          <div className="widget-card__label">{t('admin.dashboard.next7Days')}</div>
          <div className="widget-card__value">{summary.upcomingNext7Days}</div>
          <div className="widget-card__sub">{t('admin.dashboard.next7DaysSub')}</div>
        </div>
      </div>

      {/* Status breakdown */}
      {Object.keys(statusCounts).length > 0 && (
        <div className="section-card" style={{ marginBottom: '1.5rem' }}>
          <div className="section-card__header">
            <h2 className="section-card__title">{t('admin.dashboard.statusToday')}</h2>
          </div>
          <div className="section-card__body">
            <div className="status-pills">
              {(Object.entries(statusCounts) as [BookingStatus, number][]).map(([status, count]) => (
                <div className="status-pill" key={status}>
                  <div className="dot" style={{ background: STATUS_COLORS[status] }} />
                  <span>{getStatusLabel(status, t)}: <strong>{count}</strong></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Today's bookings table */}
      <div className="section-card">
        <div className="section-card__header">
          <h2 className="section-card__title">{t('admin.dashboard.todaysBookings')}</h2>
          <Link to="/admin/reservas" className="btn btn-outline" style={{ padding: '0.45rem 1rem', fontSize: '0.85rem' }}>
            {t('admin.dashboard.viewAll')} →
          </Link>
        </div>
        {bookings.length === 0 ? (
          <div className="state-empty">
            <span style={{ fontSize: '2rem' }}>🌊</span>
            {t('admin.dashboard.emptyToday')}
          </div>
        ) : (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('admin.dashboard.colTime')}</th>
                  <th>{t('admin.dashboard.colCustomer')}</th>
                  <th>{t('admin.dashboard.colPax')}</th>
                  <th>{t('admin.dashboard.colTable')}</th>
                  <th>{t('admin.dashboard.colRequests')}</th>
                  <th>{t('admin.dashboard.colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {bookings.slice(0, 10).map((b) => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 700 }}>
                      {new Date(b.date).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      <div className="customer-name">{b.customer.firstName} {b.customer.lastName}</div>
                      <div className="customer-email">{b.customer.email}</div>
                    </td>
                    <td>{b.pax} 👤</td>
                    <td>{b.table?.name ?? '—'}</td>
                    <td>
                      <div className="booking-requests-cell">
                        {b.customer.allergens && b.customer.allergens.length > 0 && (
                          <div className="request-item request-item--allergy" title={b.customer.allergens.join(', ')}>
                            <span className="request-icon">🚨</span>
                            <span className="request-text">{b.customer.allergens.join(', ')}</span>
                          </div>
                        )}
                        {b.specialRequests && (
                          <div className="request-item" title={b.specialRequests}>
                            <span className="request-icon">💬</span>
                            <span className="request-text">{b.specialRequests}</span>
                          </div>
                        )}
                        {!b.specialRequests && (!b.customer.allergens || b.customer.allergens.length === 0) && (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={STATUS_BADGE_CLASS[b.status]}>
                        {getStatusLabel(b.status, t)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
