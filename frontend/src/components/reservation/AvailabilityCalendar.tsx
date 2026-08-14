
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAvailableCalendar } from '../../services/api';

// N3.1: calendario mensual con disponibilidad real. Los días cerrados o
// completos llegan deshabilitados desde GET /availability/calendar (el
// backend ya filtra cierres, turnos y ventana de reserva).

interface Props {
  /** Fecha seleccionada 'YYYY-MM-DD' o '' */
  value: string;
  onSelect: (date: string) => void;
  pax: number;
  zoneId?: number | null;
  /** Ventana de reserva en días (limita la navegación hacia delante) */
  maxDaysAhead?: number;
  /**
   * N1.4: días de apertura semanales (0-6). Junto con onUnavailableDay,
   * convierte los días abiertos pero SIN disponibilidad en botones "completo"
   * clicables (para ofrecer la lista de espera). Los días cerrados siguen
   * deshabilitados.
   */
  openWeekdays?: number[];
  onUnavailableDay?: (date: string) => void;
}

const WEEKDAY_KEYS = ['days.mon', 'days.tue', 'days.wed', 'days.thu', 'days.fri', 'days.sat', 'days.sun'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

interface CalendarResult {
  key: string;
  days: Set<string>;
  error: boolean;
}

export default function AvailabilityCalendar({
  value,
  onSelect,
  pax,
  zoneId = null,
  maxDaysAhead = 30,
  openWeekdays,
  onUnavailableDay,
}: Props) {
  const { t, i18n } = useTranslation();
  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  // BUG-54: sin setState síncrono en el efecto — el estado de carga se DERIVA
  // comparando la clave de la última respuesta con la petición actual, y las
  // respuestas obsoletas se descartan con el cleanup del efecto.
  const [result, setResult] = useState<CalendarResult | null>(null);

  const requestKey = `${view.year}-${view.month}-${pax}-${zoneId ?? ''}`;

  useEffect(() => {
    const key = `${view.year}-${view.month}-${pax}-${zoneId ?? ''}`;
    let cancelled = false;
    getAvailableCalendar(view.year, view.month, pax, zoneId)
      .then((days) => {
        if (!cancelled) setResult({ key, days: new Set(days), error: false });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, days: new Set(), error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [view.year, view.month, pax, zoneId]);

  const loading = result?.key !== requestKey;
  const availableDays = !loading && result ? result.days : new Set<string>();
  const loadError = !loading && result?.error ? t('reservation.calendarError') : '';

  const today = new Date();
  const maxDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + maxDaysAhead);
  const isCurrentMonth = view.year === today.getFullYear() && view.month === today.getMonth() + 1;
  const nextMonthStart = new Date(view.year, view.month, 1);
  const canGoNext = nextMonthStart <= maxDate;

  const monthLabel = new Date(view.year, view.month - 1, 1).toLocaleDateString(i18n.language, {
    month: 'long',
    year: 'numeric',
  });

  const daysInMonth = new Date(view.year, view.month, 0).getDate();
  // Lunes como primer día de la semana
  const firstWeekday = (new Date(view.year, view.month - 1, 1).getDay() + 6) % 7;

  const goPrev = () => setView((v) => (v.month === 1 ? { year: v.year - 1, month: 12 } : { year: v.year, month: v.month - 1 }));
  const goNext = () => setView((v) => (v.month === 12 ? { year: v.year + 1, month: 1 } : { year: v.year, month: v.month + 1 }));

  return (
    <div className="availability-calendar" role="group" aria-label={t('reservation.dateLabel')}>
      <div className="availability-calendar__header">
        <button
          type="button"
          className="availability-calendar__nav calendar-nav-prev"
          onClick={goPrev}
          disabled={isCurrentMonth || loading}
          aria-label={t('reservation.calendarPrevMonth')}
        >
          ‹
        </button>
        <span className="availability-calendar__month">{monthLabel}</span>
        <button
          type="button"
          className="availability-calendar__nav calendar-nav-next"
          onClick={goNext}
          disabled={!canGoNext || loading}
          aria-label={t('reservation.calendarNextMonth')}
        >
          ›
        </button>
      </div>

      <div className="availability-calendar__grid">
        {WEEKDAY_KEYS.map((key) => (
          <span key={key} className="availability-calendar__weekday">{t(key)}</span>
        ))}
        {Array.from({ length: firstWeekday }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateStr = `${view.year}-${pad(view.month)}-${pad(day)}`;
          const available = availableDays.has(dateStr);
          const selected = value === dateStr;

          // N1.4: día abierto según los turnos pero sin disponibilidad → "completo"
          const cellDate = new Date(view.year, view.month - 1, day);
          const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const inRange = cellDate >= todayStart && cellDate <= maxDate;
          const isOpenWeekday = openWeekdays ? openWeekdays.includes(cellDate.getDay()) : false;
          const isFull = !loading && !available && inRange && isOpenWeekday && Boolean(onUnavailableDay);

          if (isFull) {
            return (
              <button
                key={dateStr}
                type="button"
                data-date={dateStr}
                data-full="true"
                className="availability-calendar__day availability-calendar__day--full"
                onClick={() => onUnavailableDay?.(dateStr)}
              >
                {day}
              </button>
            );
          }

          return (
            <button
              key={dateStr}
              type="button"
              data-date={dateStr}
              className={`availability-calendar__day${selected ? ' selected' : ''}`}
              disabled={!available}
              aria-pressed={selected}
              onClick={() => onSelect(dateStr)}
            >
              {day}
            </button>
          );
        })}
      </div>

      {loading && <div className="availability-calendar__status">⏳ {t('reservation.calendarLoading')}</div>}
      {!loading && loadError && <div className="availability-calendar__status error">{loadError}</div>}
      {!loading && !loadError && availableDays.size === 0 && (
        <div className="availability-calendar__status">{t('reservation.calendarNoDays')}</div>
      )}
    </div>
  );
}
