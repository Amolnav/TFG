import { describe, it, expect, vi, beforeEach } from 'vitest';
const prisma = require('../../config/database');
const { FROZEN_NOW, daysFromFrozenNow } = require('../helpers/testDates');
import { getAvailableDaysInMonth, checkAvailability } from '../../services/availabilityService';

// Fecha reservable de referencia: a 16 días del reloj congelado
const BOOKABLE_DATE = daysFromFrozenNow(16);

describe('availabilityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAvailableDaysInMonth', () => {
    it('debería retornar días disponibles si hay turnos y mesas', async () => {
      prisma.shift.findMany.mockResolvedValue([
        { id: 1, name: 'Comida', startTime: '13:00', endTime: '16:00', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], isActive: true }
      ]);
      prisma.closure.findMany.mockResolvedValue([]);
      prisma.systemConfig.findUnique.mockResolvedValue({ key: 'opening_days', value: '0,1,2,3,4,5,6' });
      prisma.table.findMany.mockResolvedValue([
        { id: 1, name: 'Mesa 1', minCapacity: 2, maxCapacity: 4, isActive: true, zone: { name: 'Terraza' } }
      ]);
      prisma.booking.findMany.mockResolvedValue([]);

      const result = await getAvailableDaysInMonth(FROZEN_NOW.getFullYear(), FROZEN_NOW.getMonth() + 1, 2);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('checkAvailability', () => {
    it('debería confirmar disponibilidad si la mesa está libre', async () => {
      prisma.shift.findMany.mockResolvedValue([
        { id: 1, name: 'Comida', startTime: '13:00', endTime: '16:00', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], slotInterval: 30, isActive: true }
      ]);
      prisma.closure.findMany.mockResolvedValue([]);
      prisma.systemConfig.findUnique.mockResolvedValue({ key: 'opening_days', value: '0,1,2,3,4,5,6' });
      prisma.table.findMany.mockResolvedValue([
        { id: 1, name: 'Mesa 1', minCapacity: 2, maxCapacity: 4, isActive: true, zone: { name: 'Terraza' } }
      ]);
      prisma.booking.findMany.mockResolvedValue([]);

      const result = await checkAvailability(BOOKABLE_DATE, '14:00', 2);
      expect(result.available).toBe(true);
    });

    it('debería rechazar el último slot si la reserva se sale del turno', async () => {
      prisma.shift.findMany.mockResolvedValue([
        { id: 1, name: 'Comida', startTime: '13:00', endTime: '16:00', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], slotInterval: 30, isActive: true }
      ]);
      prisma.closure.findMany.mockResolvedValue([]);
      prisma.systemConfig.findUnique.mockResolvedValue({ key: 'opening_days', value: '0,1,2,3,4,5,6' });
      prisma.table.findMany.mockResolvedValue([
        { id: 1, name: 'Mesa 1', minCapacity: 2, maxCapacity: 4, isActive: true, zone: { name: 'Terraza' } }
      ]);

      const result = await checkAvailability(BOOKABLE_DATE, '16:00', 2);
      expect(result.available).toBe(false);
      expect(result.message).toContain('turno disponible');
    });
  });

  // BUG-08: las sugerencias de horas alternativas no se validaban contra los
  // turnos: podían proponer horas fuera del turno o que no caben antes del
  // cierre, que luego el POST de reserva rechazaba con 409.
  describe('sugerencias de horas alternativas (BUG-08)', () => {
    beforeEach(() => {
      prisma.shift.findMany.mockResolvedValue([
        { id: 1, name: 'Comida', startTime: '13:00', endTime: '16:00', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], slotInterval: 30, isActive: true }
      ]);
      prisma.closure.findMany.mockResolvedValue([]);
      prisma.systemConfig.findUnique.mockResolvedValue({ key: 'opening_days', value: '0,1,2,3,4,5,6' });
      prisma.table.findMany.mockResolvedValue([
        { id: 1, name: 'Mesa 1', minCapacity: 2, maxCapacity: 4, isActive: true, zone: { name: 'Sala' } }
      ]);
    });

    it('no sugiere horas cuya duración se sale del turno', async () => {
      // Mesa ocupada solo 14:30-15:00: el último slot válido (14:30) está ocupado
      // y los offsets posteriores (15:00, 15:30) no caben antes de las 16:00.
      const { combineDateAndTime } = require('../../utils/dateHelpers');
      prisma.booking.findMany.mockResolvedValue([
        { id: 'b1', date: combineDateAndTime(BOOKABLE_DATE, '14:30'), duration: 30, status: 'CONFIRMED', tableId: 1 }
      ]);

      const result = await checkAvailability(BOOKABLE_DATE, '14:30', 2);
      expect(result.available).toBe(false);
      expect(result.suggestions).toEqual([]);
    });

    it('sí sugiere horas válidas dentro del turno', async () => {
      const { combineDateAndTime } = require('../../utils/dateHelpers');
      prisma.booking.findMany.mockResolvedValue([
        { id: 'b1', date: combineDateAndTime(BOOKABLE_DATE, '13:00'), duration: 30, status: 'CONFIRMED', tableId: 1 }
      ]);

      const result = await checkAvailability(BOOKABLE_DATE, '13:00', 2);
      expect(result.available).toBe(false);
      const times = result.suggestions.map((s) => s.time);
      expect(times).toContain('13:30');
      expect(times).not.toContain('12:30');
    });
  });
});
