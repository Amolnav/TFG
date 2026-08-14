
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getBookings } from '../../services/api';
import { useConfig } from '../../context/useConfig';
import type { Booking } from '../../types';
import '../../styles/pages/admin/AdminPages.css';
import '../../styles/pages/admin/ServicioPage.css';

// N2.3: hoja de servicio imprimible del día — reservas por hora con
// alérgenos destacados, VIP, notas y pax. La cocina y la sala trabajan con
// papel; los alérgenos impresos son además un tema de responsabilidad.

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const SERVICE_STATUSES = ['PENDING', 'CONFIRMED', 'RECONFIRMED', 'SEATED'];

export default function ServicioPage() {
  const { t, i18n } = useTranslation();
  const { config } = useConfig();
  const [date, setDate] = useState(todayLocal());
  // BUG-54: sin setState síncrono en efectos — la carga se deriva comparando
  // la clave (fecha) de la última respuesta con la seleccionada.
  const [result, setResult] = useState<{ key: string; rows: Booking[]; failed: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBookings({ date, limit: 200 })
      .then(({ bookings: rows }) => {
        if (cancelled) return;
        const active = rows
          .filter((b) => SERVICE_STATUSES.includes(b.status))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setResult({ key: date, rows: active, failed: false });
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setResult({ key: date, rows: [], failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  const loading = result?.key !== date;
  const bookings = !loading && result ? result.rows : [];
  const error = !loading && result?.failed ? t('admin.service.loadError') : '';

  const totalPax = bookings.reduce((sum, b) => sum + b.pax, 0);
  const withAllergens = bookings.filter((b) => (b.customer?.allergens?.length ?? 0) > 0).length;

  const formattedDate = new Date(`${date}T00:00:00`).toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const timeOf = (iso: string) =>
    new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="service-sheet">
      <div className="page-header no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>{t('admin.service.title')}</h1>
          <p>{t('admin.service.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button
            onClick={() => window.print()}
            className="btn btn-primary"
            style={{ padding: '0.6rem 1.25rem', background: 'var(--accent-action)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            🖨️ {t('admin.service.printBtn')}
          </button>
        </div>
      </div>

      {/* Cabecera visible solo en papel */}
      <div className="service-sheet__print-header">
        <h1>{config.restaurant_name} — {t('admin.service.sheetTitle')}</h1>
        <p style={{ textTransform: 'capitalize' }}>{formattedDate}</p>
      </div>

      {loading && <div className="state-loading no-print"><span className="spinner">⏳</span> {t('admin.service.loading')}</div>}
      {error && <div className="state-error no-print"><span>⚠️</span>{error}</div>}

      {!loading && !error && (
        <>
          <div className="service-sheet__summary">
            <span>📅 <strong>{bookings.length}</strong> {t('admin.service.bookingsCount')}</span>
            <span>👥 <strong>{totalPax}</strong> {t('admin.service.paxCount')}</span>
            <span>⚠️ <strong>{withAllergens}</strong> {t('admin.service.allergensCount')}</span>
          </div>

          {bookings.length === 0 ? (
            <div className="state-empty">
              <span style={{ fontSize: '2rem' }}>🍽️</span>
              {t('admin.service.empty')}
            </div>
          ) : (
            <table className="service-sheet__table">
              <thead>
                <tr>
                  <th>{t('admin.service.colTime')}</th>
                  <th>{t('admin.service.colTable')}</th>
                  <th>{t('admin.service.colCustomer')}</th>
                  <th>{t('admin.service.colPax')}</th>
                  <th>{t('admin.service.colAllergens')}</th>
                  <th>{t('admin.service.colNotes')}</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => {
                  const allergens = booking.customer?.allergens ?? [];
                  return (
                    <tr key={booking.id}>
                      <td className="service-sheet__time">{timeOf(booking.date)}</td>
                      <td>
                        {booking.table ? booking.table.name : '—'}
                        {booking.table?.zone && <span className="service-sheet__zone"> · {booking.table.zone.name}</span>}
                      </td>
                      <td>
                        {booking.customer?.firstName} {booking.customer?.lastName}
                        {booking.customer?.isVip && <span className="service-sheet__vip"> ★ VIP</span>}
                      </td>
                      <td className="service-sheet__pax">{booking.pax}</td>
                      <td>
                        {allergens.length > 0 ? (
                          <span className="service-sheet__allergens">⚠️ {allergens.join(', ')}</span>
                        ) : (
                          <span className="service-sheet__none">—</span>
                        )}
                      </td>
                      <td className="service-sheet__notes">{booking.specialRequests || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
