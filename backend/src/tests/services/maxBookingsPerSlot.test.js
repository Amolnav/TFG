import { describe, it, expect, vi, beforeEach } from 'vitest';
const prisma = require('../../config/database');
const { validateBookableSlot } = require('../../services/availabilityService');
const { daysFromFrozenNow } = require('../helpers/testDates');

// M4: Shift.maxBookingsPerSlot (límite de cocina) deja de ser un campo muerto:
// limita cuántas reservas pueden EMPEZAR en el mismo slot aunque queden mesas.
describe('availabilityService — maxBookingsPerSlot (M4)', () => {
  const date = daysFromFrozenNow(3);

  const shift = {
    id: 1,
    name: 'Continuo',
    startTime: '12:00',
    endTime: '23:30',
    slotInterval: 30,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    isActive: true,
    maxBookingsPerSlot: 2
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.shift.findMany.mockResolvedValue([shift]);
    prisma.closure.findMany.mockResolvedValue([]);
  });

  it('acepta el slot mientras no se alcanza el límite', async () => {
    prisma.booking.count.mockResolvedValue(1);
    const result = await validateBookableSlot(date, '13:00', 2);
    expect(result.valid).toBe(true);
  });

  it('rechaza el slot con SLOT_FULL al alcanzar el límite', async () => {
    prisma.booking.count.mockResolvedValue(2);
    const result = await validateBookableSlot(date, '13:00', 2);
    expect(result.valid).toBe(false);
    expect(result.code).toBe('SLOT_FULL');
  });

  it('sin límite configurado no consulta el contador', async () => {
    prisma.shift.findMany.mockResolvedValue([{ ...shift, maxBookingsPerSlot: null }]);
    const result = await validateBookableSlot(date, '13:00', 2);
    expect(result.valid).toBe(true);
    expect(prisma.booking.count).not.toHaveBeenCalled();
  });

  it('una edición excluye su propia reserva del contador', async () => {
    prisma.booking.count.mockImplementation(async ({ where }) => {
      return where.id?.not === 'booking-1' ? 1 : 2;
    });
    const result = await validateBookableSlot(date, '13:00', 2, { excludeBookingId: 'booking-1' });
    expect(result.valid).toBe(true);
  });
});
