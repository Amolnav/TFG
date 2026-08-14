
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  getBookings,
  getZones,
  getShifts,
  reassignBookingTable,
  createWalkIn,
} from '../../services/api';
import type { Booking, Shift, ZoneWithTables } from '../../types';
import { useSocket } from '../../context/useSocket';
import { translateApiError } from '../../utils/apiErrors';
import { STATUS_COLORS } from '../../constants/reservationStatus';
import '../../styles/pages/admin/AdminPages.css';
import '../../styles/pages/admin/SalaPage.css';

// N2.2: vista de sala — grid mesas × franjas del turno. Arrastrar un bloque a
// otra mesa reasigna (POST /bookings/:id/reassign); el botón Walk-in ocupa
// una mesa ahora mismo con datos mínimos.

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

const VISIBLE_STATUSES = ['PENDING', 'CONFIRMED', 'RECONFIRMED', 'SEATED', 'COMPLETED'];
const DRAGGABLE_STATUSES = ['PENDING', 'CONFIRMED', 'RECONFIRMED', 'SEATED'];

interface DayData {
  zones: ZoneWithTables[];
  shifts: Shift[];
  bookings: Booking[];
}

function DraggableBooking({ booking, left, width, draggable }: {
  booking: Booking;
  left: number;
  width: number;
  draggable: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: booking.id,
    disabled: !draggable,
  });

  const time = new Date(booking.date).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
  const label = booking.source === 'WALK_IN'
    ? `🚶 ${t('admin.floor.walkInLabel')}`
    : `${booking.customer.firstName} ${booking.customer.lastName}`;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`floor-booking${isDragging ? ' dragging' : ''}${draggable ? '' : ' locked'}`}
      data-booking={booking.id}
      style={{
        left: `${left}%`,
        width: `${width}%`,
        borderLeftColor: STATUS_COLORS[booking.status] ?? 'var(--primary)',
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      title={`${label} · ${time} · ${booking.pax} pax`}
    >
      <span className="floor-booking__name">{label}</span>
      <span className="floor-booking__meta">{time} · {booking.pax}p</span>
    </div>
  );
}

function DroppableRow({ table, children }: { table: { id: number; name: string; minCapacity: number; maxCapacity: number }; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `table-${table.id}` });
  return (
    <div className="floor-row" data-table-row={table.id}>
      <div className="floor-row__table">
        <span className="floor-row__name">{table.name}</span>
        <span className="floor-row__cap">{table.minCapacity}–{table.maxCapacity}p</span>
      </div>
      <div ref={setNodeRef} className={`floor-row__timeline${isOver ? ' over' : ''}`}>
        {children}
      </div>
    </div>
  );
}

export default function SalaPage() {
  const { t, i18n } = useTranslation();
  const { socket } = useSocket();
  const [date, setDate] = useState(todayLocal());
  const [reloadTick, setReloadTick] = useState(0);
  // BUG-54: carga derivada por clave (fecha + tick), sin setState síncrono en efectos
  const [result, setResult] = useState<{ key: string; data: DayData | null; failed: boolean } | null>(null);
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInSaving, setWalkInSaving] = useState(false);
  const [walkInError, setWalkInError] = useState('');

  const loadKey = `${date}#${reloadTick}`;

  useEffect(() => {
    let cancelled = false;
    Promise.all([getZones(true), getShifts(), getBookings({ date, limit: 200 })])
      .then(([zones, shifts, { bookings }]) => {
        if (!cancelled) setResult({ key: `${date}#${reloadTick}`, data: { zones, shifts, bookings }, failed: false });
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setResult({ key: `${date}#${reloadTick}`, data: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [date, reloadTick]);

  // Socket: la sala se refresca con cualquier cambio de reservas
  useEffect(() => {
    if (!socket) return undefined;
    const reload = () => setReloadTick((n) => n + 1);
    socket.on('new_reservation', reload);
    socket.on('reservation_updated', reload);
    socket.on('reservation_status_changed', reload);
    socket.on('reservation_cancelled', reload);
    return () => {
      socket.off('new_reservation', reload);
      socket.off('reservation_updated', reload);
      socket.off('reservation_status_changed', reload);
      socket.off('reservation_cancelled', reload);
    };
  }, [socket]);

  const loading = result?.key !== loadKey;
  const data = !loading && result ? result.data : null;
  const failed = !loading && Boolean(result?.failed);

  const weekday = new Date(`${date}T00:00:00`).getDay();
  const dayShifts = useMemo(
    () => (data?.shifts ?? []).filter((s) => s.isActive && s.daysOfWeek.includes(weekday)),
    [data, weekday]
  );
  const shift = dayShifts.find((s) => s.id === selectedShiftId) ?? dayShifts[0] ?? null;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  if (!loading && shift && selectedShiftId === null && dayShifts.length > 0) {
    // selección inicial derivada en render (sin efecto): solo fija el estado
    // si aún no hay turno elegido
    setSelectedShiftId(dayShifts[0].id);
  }

  const shiftStart = shift ? minutesOf(shift.startTime) : 0;
  const shiftEnd = shift ? minutesOf(shift.endTime) : 0;
  const totalMinutes = Math.max(shiftEnd - shiftStart, 1);

  const shiftBookings = useMemo(() => {
    if (!data || !shift) return [];
    return data.bookings.filter((b) => {
      if (!b.table || !VISIBLE_STATUSES.includes(b.status)) return false;
      const d = new Date(b.date);
      const startMin = d.getHours() * 60 + d.getMinutes();
      return startMin >= shiftStart - 30 && startMin < shiftEnd;
    });
  }, [data, shift, shiftStart, shiftEnd]);

  const hourTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let m = Math.ceil(shiftStart / 60) * 60; m <= shiftEnd; m += 60) ticks.push(m);
    return ticks;
  }, [shiftStart, shiftEnd]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const bookingId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : '';
    if (!overId.startsWith('table-')) return;
    const tableId = Number(overId.slice('table-'.length));

    const booking = shiftBookings.find((b) => b.id === bookingId);
    if (!booking || booking.table?.id === tableId) return;

    setActionError('');
    try {
      await reassignBookingTable(bookingId, tableId);
      setReloadTick((n) => n + 1);
    } catch (err) {
      console.error(err);
      setActionError(translateApiError(err, 'admin.floor.reassignError', t, i18n));
    }
  };

  const handleWalkIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setWalkInSaving(true);
    setWalkInError('');
    try {
      await createWalkIn({
        tableId: Number(formData.get('tableId')),
        pax: Number(formData.get('pax')),
        name: (formData.get('name') as string).trim() || undefined,
      });
      setWalkInOpen(false);
      setReloadTick((n) => n + 1);
    } catch (err) {
      console.error(err);
      setWalkInError(translateApiError(err, 'admin.floor.walkInError', t, i18n));
    } finally {
      setWalkInSaving(false);
    }
  };

  const allTables = (data?.zones ?? []).flatMap((zone) => zone.tables.filter((tbl) => tbl.isActive));

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>{t('admin.floor.title')}</h1>
          <p>{t('admin.floor.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setSelectedShiftId(null); }} />
          <button
            onClick={() => { setWalkInError(''); setWalkInOpen(true); }}
            className="btn btn-primary"
            style={{ padding: '0.6rem 1.25rem', background: 'var(--accent-action)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            🚶 {t('admin.floor.walkInBtn')}
          </button>
        </div>
      </div>

      {loading && <div className="state-loading"><span className="spinner">⏳</span> {t('admin.floor.loading')}</div>}
      {failed && <div className="state-error"><span>⚠️</span>{t('admin.floor.loadError')}</div>}
      {actionError && <div className="state-error"><span>⚠️</span>{actionError}</div>}

      {!loading && !failed && data && dayShifts.length === 0 && (
        <div className="state-empty">
          <span style={{ fontSize: '2rem' }}>🌙</span>
          {t('admin.floor.closedDay')}
        </div>
      )}

      {!loading && !failed && data && shift && (
        <>
          {dayShifts.length > 1 && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              {dayShifts.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedShiftId(s.id)}
                  className={`floor-shift-tab${s.id === shift.id ? ' active' : ''}`}
                >
                  {s.name} · {s.startTime}–{s.endTime}
                </button>
              ))}
            </div>
          )}

          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div className="floor-grid section-card">
              {/* Cabecera de horas */}
              <div className="floor-row floor-row--header">
                <div className="floor-row__table" />
                <div className="floor-row__timeline">
                  {hourTicks.map((m) => (
                    <span
                      key={m}
                      className="floor-tick"
                      style={{ left: `${((m - shiftStart) / totalMinutes) * 100}%` }}
                    >
                      {`${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`}
                    </span>
                  ))}
                </div>
              </div>

              {(data.zones ?? []).filter((zone) => zone.isActive !== false).map((zone) => (
                <div key={zone.id}>
                  <div className="floor-zone-label">🏢 {zone.name}</div>
                  {zone.tables.filter((tbl) => tbl.isActive).map((table) => (
                    <DroppableRow key={table.id} table={table}>
                      {/* Líneas de hora de fondo */}
                      {hourTicks.map((m) => (
                        <span
                          key={m}
                          className="floor-gridline"
                          style={{ left: `${((m - shiftStart) / totalMinutes) * 100}%` }}
                        />
                      ))}
                      {shiftBookings
                        .filter((b) => b.table?.id === table.id)
                        .map((b) => {
                          const d = new Date(b.date);
                          const startMin = d.getHours() * 60 + d.getMinutes();
                          const left = Math.max(((startMin - shiftStart) / totalMinutes) * 100, 0);
                          const width = Math.min((b.duration / totalMinutes) * 100, 100 - left);
                          return (
                            <DraggableBooking
                              key={b.id}
                              booking={b}
                              left={left}
                              width={width}
                              draggable={DRAGGABLE_STATUSES.includes(b.status)}
                            />
                          );
                        })}
                    </DroppableRow>
                  ))}
                </div>
              ))}
            </div>
          </DndContext>

          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
            💡 {t('admin.floor.hint')}
          </p>
        </>
      )}

      {/* Modal de walk-in */}
      {walkInOpen && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal__header">
              <h2>🚶 {t('admin.floor.walkInTitle')}</h2>
              <button className="admin-modal__close" onClick={() => setWalkInOpen(false)}>×</button>
            </div>
            <form onSubmit={handleWalkIn}>
              <div className="admin-modal__body">
                <div className="admin-modal__form-group">
                  <label>{t('admin.floor.walkInTable')}</label>
                  <select name="tableId" required defaultValue="">
                    <option value="" disabled>—</option>
                    {allTables.map((table) => (
                      <option key={table.id} value={table.id}>
                        {table.name} ({table.minCapacity}–{table.maxCapacity}p)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-modal__form-group">
                  <label>{t('admin.floor.walkInPax')}</label>
                  <input type="number" name="pax" min={1} defaultValue={2} required />
                </div>
                <div className="admin-modal__form-group">
                  <label>{t('admin.floor.walkInName')}</label>
                  <input type="text" name="name" placeholder={t('admin.floor.walkInNamePlaceholder')} />
                </div>
                {walkInError && <div className="state-error"><span>⚠️</span>{walkInError}</div>}
              </div>
              <div className="admin-modal__footer">
                <button type="button" onClick={() => setWalkInOpen(false)} style={{ padding: '0.5rem 1rem', background: 'var(--input-bg)', color: 'var(--text-dark)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}>
                  {t('admin.common.cancel')}
                </button>
                <button type="submit" disabled={walkInSaving} style={{ padding: '0.5rem 1rem', background: 'var(--accent-action)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {walkInSaving ? t('admin.common.saving') : t('admin.floor.walkInConfirm')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
