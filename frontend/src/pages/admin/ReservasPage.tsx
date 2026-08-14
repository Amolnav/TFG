
import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getBookings, updateBookingStatus, createBackofficeBooking, getPublicConfig } from '../../services/api';
import { useSocket } from '../../context/useSocket';
import type { Booking, BookingStatus, NewReservationEventPayload } from '../../types';
import CustomerDetailsModal from '../../components/admin/CustomerDetailsModal';
import BookingTimelineModal from '../../components/admin/BookingTimelineModal';
import { ALL_STATUSES, STATUS_BADGE_CLASS, getStatusLabel } from '../../constants/reservationStatus';
import '../../styles/pages/admin/AdminPages.css';

// BUG-48: paginación real usando el total que devuelve la API
const PAGE_SIZE = 50;

export default function ReservasPage() {
  const { t, i18n } = useTranslation();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  // N2.5: timeline de auditoría de una reserva
  const [timelineBookingId, setTimelineBookingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterStatus, setFilterStatus] = useState<BookingStatus | ''>('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  // M4: el máximo de comensales sale de las mesas reales, no de un "20" fijo
  const [maxPax, setMaxPax] = useState(20);

  useEffect(() => {
    getPublicConfig()
      .then((data) => { if (data.maxPax) setMaxPax(data.maxPax); })
      .catch((err) => console.error('Error fetching max pax:', err));
  }, []);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newBooking, setNewBooking] = useState({
    date: '',
    time: '',
    pax: 2,
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    specialRequests: '',
    allergens: '',
  });
  const [incomingReservation, setIncomingReservation] = useState<NewReservationEventPayload | null>(null);
  const { socket } = useSocket();

  const fetchBookings = useCallback(() => {
    setLoading(true);
    getBookings({
      date: filterDate || undefined,
      status: filterStatus || undefined,
      page,
      limit: PAGE_SIZE,
    })
      .then((res) => {
        // API may return data as array or { bookings } object
        if (Array.isArray(res)) {
          setBookings(res as unknown as Booking[]);
          setTotal((res as unknown as Booking[]).length);
        } else {
          setBookings(res.bookings ?? []);
          setTotal(res.total ?? 0);
        }
        setError(''); // BUG-50: sin esto, un fallo transitorio dejaba el banner rojo para siempre
      })
      .catch(() => setError(t('admin.reservations.loadError')))
      .finally(() => setLoading(false));
  }, [filterDate, filterStatus, page, t]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  useEffect(() => {
    if (!socket) return undefined;

    const handleNewReservation = (payload: NewReservationEventPayload) => {
      setIncomingReservation(payload);
      fetchBookings();
    };

    // BUG-18: la lista también se refresca con cambios hechos desde otros puestos
    const handleChange = () => fetchBookings();

    socket.on('new_reservation', handleNewReservation);
    socket.on('reservation_updated', handleChange);
    socket.on('reservation_status_changed', handleChange);
    socket.on('reservation_cancelled', handleChange);
    return () => {
      socket.off('new_reservation', handleNewReservation);
      socket.off('reservation_updated', handleChange);
      socket.off('reservation_status_changed', handleChange);
      socket.off('reservation_cancelled', handleChange);
    };
  }, [socket, fetchBookings]);

  // BUG-49: la notificación de reserva entrante desaparece sola a los ~6 s
  useEffect(() => {
    if (!incomingReservation) return undefined;
    const timeoutId = setTimeout(() => setIncomingReservation(null), 6000);
    return () => clearTimeout(timeoutId);
  }, [incomingReservation]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleStatusChange = async (id: string, newStatus: BookingStatus) => {
    setUpdatingId(id);
    try {
      await updateBookingStatus(id, newStatus);
      setBookings((prev) =>
        prev.map((b) => b.id === id ? { ...b, status: newStatus } : b)
      );
    } catch {
      alert(t('admin.reservations.statusUpdateError'));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await createBackofficeBooking({
        date: newBooking.date,
        time: newBooking.time,
        pax: newBooking.pax,
        customer: {
          firstName: newBooking.firstName,
          lastName: newBooking.lastName,
          email: newBooking.email,
          phone: newBooking.phone,
          allergens: newBooking.allergens.split(',').map(a => a.trim()).filter(a => a),
        },
        specialRequests: newBooking.specialRequests,
        source: 'BACKOFFICE'
      });
      setIsModalOpen(false);
      setNewBooking({ date: '', time: '', pax: 2, firstName: '', lastName: '', email: '', phone: '', specialRequests: '', allergens: '' });
      fetchBookings();
    } catch {
      alert(t('admin.reservations.createError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>{t('admin.reservations.title')}</h1>
          <p>{t('admin.reservations.subtitle')}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          {t('admin.reservations.addBooking')}
        </button>
      </div>

      {incomingReservation && (
        <div className="section-card section-card--alert" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <div>
              <strong>{t('admin.reservations.incoming')}</strong> {incomingReservation.customerName} • {incomingReservation.pax} pax • {t('admin.reservations.tableWord')} {incomingReservation.tableName ?? t('admin.reservations.tableUnassigned')}
            </div>
            <button
              className="btn btn-ghost"
              onClick={() => setIncomingReservation(null)}
              style={{ fontSize: '0.85rem', padding: '0.4rem 0.75rem' }}
            >
              {t('admin.common.close')}
            </button>
          </div>
        </div>
      )}

      <div className="section-card">
        <div className="section-card__header">
          <h2 className="section-card__title">{t('admin.reservations.listTitle')}</h2>
          <div className="filters-bar">
            <input
              type="date"
              value={filterDate}
              onChange={(e) => { setFilterDate(e.target.value); setPage(1); }}
              title={t('admin.reservations.filterByDate')}
            />
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value as BookingStatus | ''); setPage(1); }}
            >
              <option value="">{t('admin.reservations.allStatuses')}</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{getStatusLabel(s, t)}</option>
              ))}
            </select>
            {(filterDate || filterStatus) && (
              <button
                className="btn btn-ghost"
                style={{ background: 'var(--bg-light)', color: 'var(--text-muted)', border: '1.5px solid var(--border)', padding: '0.45rem 0.85rem', fontSize: '0.85rem' }}
                onClick={() => { setFilterDate(''); setFilterStatus(''); setPage(1); }}
              >
                ✕ {t('admin.reservations.clearFilters')}
              </button>
            )}
          </div>
        </div>

        {loading && (
          <div className="state-loading">
            <span className="spinner">⏳</span> {t('admin.reservations.loading')}
          </div>
        )}

        {error && <div className="state-error"><span>⚠️</span>{error}</div>}

        {!loading && !error && bookings.length === 0 && (
          <div className="state-empty">
            <span style={{ fontSize: '2rem' }}>🔍</span>
            {t('admin.reservations.empty')}
          </div>
        )}

        {!loading && bookings.length > 0 && (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('admin.reservations.colDate')}</th>
                  <th>{t('admin.reservations.colTime')}</th>
                  <th>{t('admin.reservations.colCustomer')}</th>
                  <th>{t('admin.reservations.colPax')}</th>
                  <th>{t('admin.reservations.colTable')}</th>
                  <th>{t('admin.reservations.colSource')}</th>
                  <th>{t('admin.reservations.colRequests')}</th>
                  <th>{t('admin.reservations.colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => {
                  const dt = new Date(b.date);

                  // Helper for row class
                  let rowClass = '';
                  if (b.customer.isBlacklisted) rowClass = 'customer-row--blacklisted';
                  else if (b.customer.isVip) rowClass = 'customer-row--vip';

                  return (
                    <tr key={b.id} className={rowClass}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {dt.toLocaleDateString(i18n.language, { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {dt.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <div
                            className="customer-name"
                            onClick={() => setSelectedCustomerId(b.customer.id)}
                            style={{
                              cursor: 'pointer',
                              color: 'var(--primary)',
                              textDecoration: 'underline',
                              fontWeight: 600,
                              whiteSpace: 'nowrap'
                            }}
                            title={t('admin.reservations.viewCustomer')}
                          >
                            {b.customer.firstName} {b.customer.lastName}
                          </div>
                          <div className="customer-badges" style={{ display: 'flex', gap: '0.25rem' }}>
                            {b.customer.isVip && (
                              <span className="customer-badge customer-badge--vip" title={t('admin.reservations.vipBadge')} style={{ padding: '0.1rem 0.35rem' }}>⭐</span>
                            )}
                            {b.customer.isBlacklisted && (
                              <span className="customer-badge customer-badge--blacklist" title={t('admin.reservations.blacklistBadge')} style={{ padding: '0.1rem 0.35rem' }}>🚫</span>
                            )}
                            {b.customer.tags?.filter(tag => tag !== 'VIP' && tag !== 'BLACKLIST').map(tag => (
                              <span
                                key={tag}
                                className="customer-badge customer-badge--tag"
                                style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center' }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="customer-email">{b.customer.email}</div>
                      </td>
                      <td>{b.pax}</td>
                      <td>{b.table?.name ?? '—'}</td>
                      <td>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {b.source === 'WEB' ? `🌐 ${t('admin.reservations.sourceWeb')}` : b.source === 'PHONE' ? `📞 ${t('admin.reservations.sourcePhone')}` : b.source === 'WALK_IN' ? `🚶 ${t('admin.reservations.sourceWalkIn')}` : `🖥️ ${t('admin.reservations.sourceBackoffice')}`}
                        </span>
                      </td>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <select
                            className={`status-select ${STATUS_BADGE_CLASS[b.status]}`}
                            value={b.status}
                            disabled={updatingId === b.id}
                            onChange={(e) => handleStatusChange(b.id, e.target.value as BookingStatus)}
                            title={t('admin.reservations.changeStatus')}
                          >
                            {ALL_STATUSES.map((s) => (
                              <option key={s} value={s}>{getStatusLabel(s, t)}</option>
                            ))}
                          </select>
                          {/* N2.5: timeline de auditoría */}
                          <button
                            onClick={() => setTimelineBookingId(b.id)}
                            title={t('admin.timeline.open')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '0.1rem' }}
                          >
                            📜
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* BUG-48: barra de paginación */}
        {!loading && !error && total > 0 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '1rem',
              padding: '0.9rem 1.25rem',
              borderTop: '1px solid var(--border)',
              flexWrap: 'wrap',
            }}
          >
            <button
              className="btn btn-outline"
              style={{ padding: '0.45rem 1rem', fontSize: '0.85rem' }}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← {t('admin.reservations.prevPage')}
            </button>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              {t('admin.reservations.pageInfo', { page, pages: totalPages, total })}
            </span>
            <button
              className="btn btn-outline"
              style={{ padding: '0.45rem 1rem', fontSize: '0.85rem' }}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {t('admin.reservations.nextPage')} →
            </button>
          </div>
        )}
      </div>

      {/* Reusable Customer Details Modal */}
      {selectedCustomerId && (
        <CustomerDetailsModal
          customerId={selectedCustomerId}
          onClose={() => setSelectedCustomerId(null)}
          onUpdate={fetchBookings}
        />
      )}

      {/* N2.5: timeline de auditoría de la reserva */}
      {timelineBookingId && (
        <BookingTimelineModal
          bookingId={timelineBookingId}
          onClose={() => setTimelineBookingId(null)}
        />
      )}

      {/* Modal para añadir reserva */}
      {isModalOpen && (
        <div className="admin-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal__header">
              <h2>{t('admin.reservations.newBookingTitle')}</h2>
              <button className="admin-modal__close" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateBooking}>
              <div className="admin-modal__body">
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div className="admin-modal__form-group" style={{ flex: 1 }}>
                    <label>{t('admin.reservations.dateLabel')}</label>
                    <input type="date" value={newBooking.date} onChange={e => setNewBooking({ ...newBooking, date: e.target.value })} />
                  </div>
                  <div className="admin-modal__form-group" style={{ flex: 1 }}>
                    <label>{t('admin.reservations.timeLabel')}</label>
                    <input type="time" value={newBooking.time} onChange={e => setNewBooking({ ...newBooking, time: e.target.value })} />
                  </div>
                  <div className="admin-modal__form-group" style={{ flex: 1 }}>
                    <label>{t('admin.reservations.paxLabel')}</label>
                    <input type="number" min="1" max={maxPax} value={newBooking.pax} onChange={e => setNewBooking({ ...newBooking, pax: parseInt(e.target.value) || 1 })} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div className="admin-modal__form-group" style={{ flex: 1 }}>
                    <label>{t('admin.reservations.firstNameLabel')}</label>
                    <input type="text" value={newBooking.firstName} onChange={e => setNewBooking({ ...newBooking, firstName: e.target.value })} />
                  </div>
                  <div className="admin-modal__form-group" style={{ flex: 1 }}>
                    <label>{t('admin.reservations.lastNameLabel')}</label>
                    <input type="text" value={newBooking.lastName} onChange={e => setNewBooking({ ...newBooking, lastName: e.target.value })} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div className="admin-modal__form-group" style={{ flex: 1 }}>
                    <label>{t('admin.reservations.emailLabel')}</label>
                    <input type="email" value={newBooking.email} onChange={e => setNewBooking({ ...newBooking, email: e.target.value })} />
                  </div>
                  <div className="admin-modal__form-group" style={{ flex: 1 }}>
                    <label>{t('admin.reservations.phoneLabel')}</label>
                    <input type="tel" value={newBooking.phone} onChange={e => setNewBooking({ ...newBooking, phone: e.target.value })} />
                  </div>
                </div>

                <div className="admin-modal__form-group">
                  <label>{t('admin.reservations.allergensLabel')}</label>
                  <input type="text" placeholder={t('admin.reservations.allergensPlaceholder')} value={newBooking.allergens} onChange={e => setNewBooking({ ...newBooking, allergens: e.target.value })} />
                </div>

                <div className="admin-modal__form-group">
                  <label>{t('admin.reservations.requestsLabel')}</label>
                  <textarea rows={2} value={newBooking.specialRequests} onChange={e => setNewBooking({ ...newBooking, specialRequests: e.target.value })}></textarea>
                </div>
              </div>
              <div className="admin-modal__footer">
                <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>{t('admin.common.cancel')}</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? t('admin.common.saving') : t('admin.reservations.createBooking')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
