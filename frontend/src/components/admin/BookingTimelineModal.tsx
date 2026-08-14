
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getBookingEvents } from '../../services/api';
import type { BookingEvent } from '../../services/api';
import { getStatusLabel } from '../../constants/reservationStatus';
import type { BookingStatus } from '../../types';

// N2.5: timeline de auditoría de una reserva ("¿quién movió esta mesa?").

const TYPE_ICONS: Record<string, string> = {
  CREATED: '✨',
  STATUS_CHANGED: '🔄',
  RESCHEDULED: '🕐',
  MODIFIED: '✏️',
  TABLE_REASSIGNED: '🪑',
  CANCELLED: '✖️',
  RECONFIRMED: '👍',
  REMINDER_SENT: '⏰',
  REVIEW_REQUEST_SENT: '⭐',
};

interface Props {
  bookingId: string;
  onClose: () => void;
}

export default function BookingTimelineModal({ bookingId, onClose }: Props) {
  const { t, i18n } = useTranslation();
  // BUG-54: carga derivada por clave, sin setState síncrono en el efecto
  const [result, setResult] = useState<{ key: string; events: BookingEvent[]; failed: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBookingEvents(bookingId)
      .then((events) => {
        if (!cancelled) setResult({ key: bookingId, events, failed: false });
      })
      .catch(() => {
        if (!cancelled) setResult({ key: bookingId, events: [], failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const loading = result?.key !== bookingId;
  const events = !loading && result ? result.events : [];
  const failed = !loading && Boolean(result?.failed);

  const detailOf = (event: BookingEvent): string => {
    const payload = event.payload ?? {};
    switch (event.type) {
      case 'STATUS_CHANGED': {
        const from = payload.from ? getStatusLabel(payload.from as BookingStatus, t) : '—';
        const to = payload.to ? getStatusLabel(payload.to as BookingStatus, t) : '—';
        return `${from} → ${to}`;
      }
      case 'RESCHEDULED': {
        const fmt = (value: unknown) =>
          value
            ? new Date(String(value)).toLocaleString(i18n.language, {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
              })
            : '—';
        return `${fmt(payload.fromDate)} → ${fmt(payload.toDate)}`;
      }
      case 'TABLE_REASSIGNED':
        return payload.toTableName ? `→ ${payload.toTableName}` : '';
      case 'CANCELLED':
        return payload.via ? String(payload.via) : '';
      case 'CREATED':
        return payload.source ? String(payload.source) : '';
      default:
        return '';
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal__header">
          <h2>📜 {t('admin.timeline.title')}</h2>
          <button className="admin-modal__close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal__body">
          {loading && <div className="state-loading"><span className="spinner">⏳</span> {t('admin.timeline.loading')}</div>}
          {failed && <div className="state-error"><span>⚠️</span>{t('admin.timeline.loadError')}</div>}
          {!loading && !failed && events.length === 0 && (
            <div className="state-empty">{t('admin.timeline.empty')}</div>
          )}
          {!loading && !failed && events.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {events.map((event) => (
                <li key={event.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', borderBottom: '1px dashed var(--border)', paddingBottom: '0.6rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>{TYPE_ICONS[event.type] || '•'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                      {t(`admin.timeline.types.${event.type}`, { defaultValue: event.type })}
                      {detailOf(event) && (
                        <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> · {detailOf(event)}</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(event.createdAt).toLocaleString(i18n.language, {
                        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                      {event.actor && ` · ${t('admin.timeline.by', { actor: event.actor })}`}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
