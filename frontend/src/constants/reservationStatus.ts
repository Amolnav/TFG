import type { TFunction } from 'i18next';
import type { BookingStatus } from '../types';

// BUG-53: las etiquetas de estado se resuelven vía i18n (claves admin.status.*)
// para que el panel admin siga el idioma seleccionado.
export function getStatusLabel(status: BookingStatus, t: TFunction): string {
  return t(`admin.status.${status}`);
}

export const STATUS_COLORS: Record<BookingStatus, string> = {
  PENDING: 'var(--status-pending)',
  CONFIRMED: 'var(--status-confirmed)',
  RECONFIRMED: 'var(--status-reconfirmed)',
  SEATED: 'var(--status-seated)',
  COMPLETED: 'var(--status-completed)',
  CANCELLED: 'var(--status-cancelled)',
  NO_SHOW: 'var(--status-no-show)',
};

export const STATUS_BADGE_CLASS: Record<BookingStatus, string> = {
  PENDING: 'badge badge-pending',
  CONFIRMED: 'badge badge-confirmed',
  RECONFIRMED: 'badge badge-reconfirmed',
  SEATED: 'badge badge-seated',
  COMPLETED: 'badge badge-completed',
  CANCELLED: 'badge badge-cancelled',
  NO_SHOW: 'badge badge-no-show',
};

export const ALL_STATUSES: BookingStatus[] = [
  'PENDING',
  'CONFIRMED',
  'RECONFIRMED',
  'SEATED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
];
