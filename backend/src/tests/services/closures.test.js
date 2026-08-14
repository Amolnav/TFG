import { describe, it, expect, vi, beforeEach } from 'vitest';
const prisma = require('../../config/database');
const { daysFromFrozenNow } = require('../helpers/testDates');
const { checkAvailability } = require('../../services/availabilityService');
const { combineDateAndTime } = require('../../utils/dateHelpers');

const BOOKABLE_DATE = daysFromFrozenNow(16);
const FIVE_DAYS_BEFORE = daysFromFrozenNow(11);

// BUG-11: para la disponibilidad, un cierre con endDate = null se trataba
// como "cerrado indefinidamente desde startDate", mientras el back-office lo
// listaba como cierre puntual. Semántica unificada: endDate = null → cierre
// de UN solo día (el de startDate).
describe('semántica de cierres con endDate null (BUG-11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.systemConfig.findUnique.mockResolvedValue({ key: 'opening_days', value: '0,1,2,3,4,5,6' });
    prisma.shift.findMany.mockResolvedValue([
      { id: 1, name: 'Comida', startTime: '13:00', endTime: '16:00', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], slotInterval: 30, isActive: true }
    ]);
    prisma.table.findMany.mockResolvedValue([
      { id: 1, name: 'Mesa 1', minCapacity: 2, maxCapacity: 4, isActive: true, zone: { name: 'Sala' } }
    ]);
    prisma.booking.findMany.mockResolvedValue([]);
  });

  it('un cierre de un día (endDate null) en el pasado NO cierra los días posteriores', async () => {
    prisma.closure.findMany.mockResolvedValue([
      {
        id: 'cl1',
        startDate: combineDateAndTime(FIVE_DAYS_BEFORE, '00:00'),
        endDate: null,
        isFullDay: true,
        shiftId: null,
        reason: 'Festivo puntual'
      }
    ]);

    const result = await checkAvailability(BOOKABLE_DATE, '14:00', 2);
    expect(result.available).toBe(true);
  });

  it('un cierre de un día (endDate null) SÍ cierra ese mismo día', async () => {
    prisma.closure.findMany.mockResolvedValue([
      {
        id: 'cl2',
        startDate: combineDateAndTime(BOOKABLE_DATE, '00:00'),
        endDate: null,
        isFullDay: true,
        shiftId: null,
        reason: 'Festivo puntual'
      }
    ]);

    const result = await checkAvailability(BOOKABLE_DATE, '14:00', 2);
    expect(result.available).toBe(false);
    expect(result.message).toContain('cerrado');
  });

  it('un cierre con rango (endDate definido) sigue cubriendo todo el rango', async () => {
    prisma.closure.findMany.mockResolvedValue([
      {
        id: 'cl3',
        startDate: combineDateAndTime(daysFromFrozenNow(15), '00:00'),
        endDate: combineDateAndTime(daysFromFrozenNow(17), '23:59'),
        isFullDay: true,
        shiftId: null,
        reason: 'Vacaciones'
      }
    ]);

    const result = await checkAvailability(BOOKABLE_DATE, '14:00', 2);
    expect(result.available).toBe(false);
  });
});
