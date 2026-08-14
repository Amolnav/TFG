import { describe, it, expect, vi, beforeEach } from 'vitest';
const prisma = require('../../config/database');
const { FROZEN_NOW, daysFromFrozenNow } = require('../helpers/testDates');
const { getAvailableTimesForDay, getAvailableDaysInMonth, checkAvailability } = require('../../services/availabilityService');
const { combineDateAndTime } = require('../../utils/dateHelpers');

const BOOKABLE_DATE = daysFromFrozenNow(16);

// BUG-22: la disponibilidad consultaba la BD por día × turno × slot × mesa
// (miles de queries por petición de calendario). Las reservas del rango deben
// cargarse en UNA query y comprobarse en memoria.
describe('rendimiento de disponibilidad (BUG-22)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.systemConfig.findUnique.mockResolvedValue({ key: 'opening_days', value: '0,1,2,3,4,5,6' });
    prisma.shift.findMany.mockResolvedValue([
      { id: 1, name: 'Comida', startTime: '13:00', endTime: '16:00', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], slotInterval: 30, isActive: true }
    ]);
    prisma.closure.findMany.mockResolvedValue([]);
    prisma.table.findMany.mockResolvedValue([
      { id: 1, name: 'Mesa 1', minCapacity: 2, maxCapacity: 4, isActive: true, zone: { name: 'Sala' } },
      { id: 2, name: 'Mesa 2', minCapacity: 2, maxCapacity: 4, isActive: true, zone: { name: 'Sala' } }
    ]);
    prisma.booking.findMany.mockResolvedValue([]);
  });

  it('getAvailableTimesForDay hace como mucho 1 consulta de reservas', async () => {
    const result = await getAvailableTimesForDay(BOOKABLE_DATE, 2);
    expect(result.times.length).toBeGreaterThan(0);
    expect(prisma.booking.findMany.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('getAvailableDaysInMonth hace como mucho 1 consulta de reservas para todo el mes', async () => {
    const result = await getAvailableDaysInMonth(FROZEN_NOW.getFullYear(), FROZEN_NOW.getMonth() + 1, 2);
    expect(result.length).toBeGreaterThan(0);
    expect(prisma.booking.findMany.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('checkAvailability (incluidas sugerencias) hace como mucho 1 consulta de reservas', async () => {
    prisma.booking.findMany.mockResolvedValue([
      { id: 'b1', date: combineDateAndTime(BOOKABLE_DATE, '13:00'), duration: 30, status: 'CONFIRMED', tableId: 1 },
      { id: 'b2', date: combineDateAndTime(BOOKABLE_DATE, '13:00'), duration: 30, status: 'CONFIRMED', tableId: 2 }
    ]);

    const result = await checkAvailability(BOOKABLE_DATE, '13:00', 2);
    expect(result.available).toBe(false);
    expect(prisma.booking.findMany.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
