import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAvailableTimes, getPublicConfig, joinWaitlist } from '../../services/api';
import { useConfig } from '../../context/useConfig';
import AvailabilityCalendar from './AvailabilityCalendar';
import WaitlistForm from './WaitlistForm';
import type { TimeSlot } from '../../types';

interface Props {
  onNext: (data: { date: string; time: string; pax: number; zoneId?: number }) => void;
}

export default function Step1DateTime({ onNext }: Props) {
  const { t } = useTranslation();
  const { config } = useConfig();
  // N1.4: el email de lista de espera enlaza a /reservar?date=...&pax=...
  const [searchParams] = useSearchParams();

  // N3.2: selector de zona opcional (activable por config, solo si hay >1 zona)
  const zoneSelectionActive = config.zone_selection_enabled === 'true' && config.zones.length > 1;
  const [zoneId, setZoneId] = useState<number | null>(null);

  // N1.4: lista de espera cuando un día abierto está completo
  const waitlistActive = config.waitlist_enabled === 'true';
  const [waitlistDate, setWaitlistDate] = useState('');

  const [date, setDate] = useState('');
  const initialPax = Number(searchParams.get('pax'));
  const [pax, setPax] = useState(initialPax >= 1 && initialPax <= 50 ? initialPax : 2);
  const [maxPax, setMaxPax] = useState(12); // Default to 12
  // N3.1: ventana de reserva para limitar la navegación del calendario
  const [maxDaysAhead, setMaxDaysAhead] = useState(30);
  const [selectedTime, setSelectedTime] = useState('');
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const [error, setError] = useState('');
  // BUG-42: descarta respuestas obsoletas cuando el usuario cambia
  // rápidamente fecha/pax (la respuesta lenta de una petición anterior
  // podía pintar horarios de otro pax)
  const requestIdRef = useRef(0);

  useEffect(() => {
    getPublicConfig().then(data => {
      if (data.maxPax) setMaxPax(data.maxPax);
      if (data.maxDaysAhead) setMaxDaysAhead(data.maxDaysAhead);
    }).catch(err => console.error('Error fetching public config:', err));
  }, []);

  // N1.4: prefill desde la URL (?date=YYYY-MM-DD). La carga de horarios se
  // encola en microtask para no hacer setState síncrono en el efecto (BUG-54).
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current) return;
    prefilledRef.current = true;
    const dateParam = searchParams.get('date');
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      queueMicrotask(() => handleDateChange(dateParam));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // BUG-54: la carga de horarios se dispara desde los handlers de cambio de
  // fecha/pax (eventos de usuario) en lugar de un efecto con setState síncrono,
  // que provocaba renders en cascada (react-hooks/set-state-in-effect).
  const loadSlots = (newDate: string, newPax: number, newZoneId: number | null = zoneId) => {
    if (!newDate || !newPax) return;
    const requestId = ++requestIdRef.current;
    setSelectedTime('');
    setSlots([]);
    setSlotsError('');
    setLoadingSlots(true);
    getAvailableTimes(newDate, newPax, newZoneId)
      .then((data) => {
        if (requestId !== requestIdRef.current) return; // respuesta obsoleta
        const available = data.filter((s: TimeSlot) => s.available);
        if (available.length === 0) {
          setSlotsError(t('reservation.errorNoSlots'));
        }
        setSlots(data);
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return;
        setSlotsError(t('reservation.errorLoadSlots'));
      })
      .finally(() => {
        if (requestId !== requestIdRef.current) return;
        setLoadingSlots(false);
      });
  };

  const handleDateChange = (value: string) => {
    setDate(value);
    setError('');
    setWaitlistDate('');
    loadSlots(value, pax);
  };

  const handlePaxChange = (value: number) => {
    setPax(value);
    loadSlots(date, value);
  };

  const handleZoneChange = (value: string) => {
    const newZoneId = value ? Number(value) : null;
    setZoneId(newZoneId);
    loadSlots(date, pax, newZoneId);
  };

  const handleSubmit = () => {
    if (!date) { setError(t('reservation.errorNoDate')); return; }
    if (!selectedTime) { setError(t('reservation.errorNoTime')); return; }
    setError('');
    onNext({ date, time: selectedTime, pax, zoneId: zoneId ?? undefined });
  };

  return (
    <div>
      <h2 className="form-title">{t('reservation.step1Title')}</h2>
      <p className="form-subtitle">{t('reservation.step1Subtitle')}</p>

      <div className="form-grid">
        <div className={zoneSelectionActive ? 'form-grid form-grid-2' : undefined}>
          <div className="form-group">
            <label htmlFor="res-pax">{t('reservation.paxLabel')}</label>
            <select
              id="res-pax"
              value={pax}
              onChange={(e) => handlePaxChange(Number(e.target.value))}
            >
              {Array.from({ length: maxPax }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n} {n === 1 ? t('reservation.person') : t('reservation.persons')}</option>
              ))}
            </select>
          </div>

          {zoneSelectionActive && (
            <div className="form-group">
              <label htmlFor="res-zone">{t('reservation.zoneLabel')}</label>
              <select
                id="res-zone"
                value={zoneId ?? ''}
                onChange={(e) => handleZoneChange(e.target.value)}
              >
                <option value="">{t('reservation.zoneAny')}</option>
                {config.zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>{zone.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* N3.1: calendario con disponibilidad real (días cerrados/completos deshabilitados) */}
        <div className="form-group">
          <span className="time-slots-label">{t('reservation.dateLabel')}</span>
          <AvailabilityCalendar
            value={date}
            pax={pax}
            zoneId={zoneId}
            maxDaysAhead={maxDaysAhead}
            onSelect={handleDateChange}
            openWeekdays={waitlistActive ? config.schedule.openingDays : undefined}
            onUnavailableDay={waitlistActive ? (d) => { setWaitlistDate(d); setDate(''); } : undefined}
          />
        </div>

        {/* N1.4: día completo → oferta de lista de espera */}
        {waitlistActive && waitlistDate && (
          <WaitlistForm
            date={waitlistDate}
            pax={pax}
            onClose={() => setWaitlistDate('')}
            onJoin={(payload) => joinWaitlist(payload)}
          />
        )}

        {/* Time slots */}
        {date && (
          <div>
            <span className="time-slots-label">{t('reservation.timeLabel')}</span>
            {loadingSlots && (
              <div className="time-slots-loading">
                <span>⏳</span> {t('reservation.loadingSlots')}
              </div>
            )}
            {!loadingSlots && slotsError && (
              <div className="time-slots-empty">{slotsError}</div>
            )}
            {!loadingSlots && !slotsError && slots.length > 0 && (
              <div className="time-slots-grid">
                {slots
                  .filter((s) => s.available)
                  .map((s) => (
                    <button
                      key={s.time}
                      type="button"
                      className={`time-slot-btn${selectedTime === s.time ? ' selected' : ''}`}
                      onClick={() => { setSelectedTime(s.time); setError(''); }}
                    >
                      {s.time}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

        {error && <div className="error-msg">{error}</div>}

        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={handleSubmit}
          disabled={!date || !selectedTime}
          style={{ marginTop: '0.5rem' }}
        >
          {t('reservation.nextBtn')}
        </button>
      </div>
    </div>
  );
}
