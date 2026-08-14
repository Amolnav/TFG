import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
const prisma = require('../../config/database');
const { JWT_SECRET } = require('../../config/auth');
// Espía sobre el módulo compartido (los controladores llaman
// socketManager.emitToBackoffice(...) sin desestructurar)
const socketManager = require('../../socketManager');
const emitToBackoffice = vi.spyOn(socketManager, 'emitToBackoffice').mockImplementation(() => {});
const { daysFromFrozenNow } = require('../helpers/testDates');
const { combineDateAndTime } = require('../../utils/dateHelpers');

const token = jwt.sign({ id: 'test', email: 'test@test.com', name: 'Test', role: 'ADMIN' }, JWT_SECRET);
const auth = { Authorization: `Bearer ${token}` };

const TODAY = daysFromFrozenNow(0);
const FUTURE_DATE = daysFromFrozenNow(16);

// BUG-14: editar una reserva desde el back-office re-aplicaba la antelación
// mínima de cliente (2 h): el staff no podía ajustar reservas inminentes.
// BUG-18: alta, edición y reasignación desde back-office no emitían sockets.
describe('edición de reservas desde back-office (BUG-14, BUG-18)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.systemConfig.findUnique.mockResolvedValue({ key: 'opening_days', value: '0,1,2,3,4,5,6' });
    prisma.shift.findMany.mockResolvedValue([
      { id: 1, name: 'Continuo', startTime: '10:00', endTime: '16:00', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], slotInterval: 30, isActive: true }
    ]);
    prisma.closure.findMany.mockResolvedValue([]);
    prisma.table.findFirst.mockResolvedValue({ maxCapacity: 10 });
    prisma.table.findUnique.mockResolvedValue({ id: 1, name: 'Mesa 1', isActive: true, minCapacity: 2, maxCapacity: 4, zone: { name: 'Sala' } });
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.update.mockImplementation(async ({ data }) => ({
      id: 'b1',
      ...data,
      customer: { id: 'c1', firstName: 'Ana', lastName: 'García', email: 'ana@example.com' },
      table: { id: 1, name: 'Mesa 1', zone: { name: 'Sala' } }
    }));
    prisma.customer.update.mockResolvedValue({});
  });

  it('el staff puede cambiar el pax de una reserva que empieza en menos de 2 horas', async () => {
    prisma.booking.findUnique.mockResolvedValue({
      id: 'b1',
      date: combineDateAndTime(TODAY, '11:00'), // 1 h desde el reloj congelado (10:00)
      pax: 2,
      duration: 90,
      tableId: 1,
      status: 'CONFIRMED',
      table: { id: 1, name: 'Mesa 1' }
    });

    const res = await request(app)
      .patch('/api/backoffice/bookings/b1')
      .set(auth)
      .send({ pax: 3 });

    expect(res.status).toBe(200);
    expect(prisma.booking.update).toHaveBeenCalled();
  });

  it('la edición emite el evento socket reservation_updated (BUG-18)', async () => {
    prisma.booking.findUnique.mockResolvedValue({
      id: 'b1',
      date: combineDateAndTime(FUTURE_DATE, '13:00'),
      pax: 2,
      duration: 90,
      tableId: 1,
      status: 'CONFIRMED',
      table: { id: 1, name: 'Mesa 1' }
    });

    await request(app)
      .patch('/api/backoffice/bookings/b1')
      .set(auth)
      .send({ pax: 3 });

    expect(emitToBackoffice).toHaveBeenCalledWith(
      'reservation_updated',
      expect.objectContaining({ id: 'b1' })
    );
  });

  it('la reserva pública SÍ mantiene la antelación mínima (400)', async () => {
    const res = await request(app)
      .post('/api/public/reservations')
      .send({
        date: TODAY,
        time: '11:00',
        pax: 2,
        customer: { firstName: 'Juan', lastName: 'Pérez', email: 'juan@example.com', phone: '600123456' }
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('antelación');
  });

  it('el alta desde back-office emite new_reservation (BUG-18)', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.customer.create.mockImplementation(async ({ data }) => ({ id: 'c-nuevo', ...data }));
    prisma.booking.create.mockResolvedValue({
      id: 'nb1',
      date: combineDateAndTime(FUTURE_DATE, '13:00'),
      pax: 2,
      status: 'CONFIRMED',
      customer: { id: 'c-nuevo', firstName: 'Juan', lastName: 'Pérez', email: 'juan@example.com' },
      table: { id: 1, name: 'Mesa 1', zone: { name: 'Sala' } }
    });

    const res = await request(app)
      .post('/api/backoffice/bookings')
      .set(auth)
      .send({
        date: FUTURE_DATE,
        time: '13:00',
        pax: 2,
        tableId: 1,
        customer: { firstName: 'Juan', lastName: 'Pérez', email: 'juan@example.com', phone: '600123456' }
      });

    expect(res.status).toBe(201);
    expect(emitToBackoffice).toHaveBeenCalledWith(
      'new_reservation',
      expect.objectContaining({ id: 'nb1' })
    );
  });

  it('la reasignación de mesa emite reservation_updated (BUG-18)', async () => {
    prisma.booking.findUnique.mockResolvedValue({
      id: 'b1',
      date: combineDateAndTime(FUTURE_DATE, '13:00'),
      pax: 2,
      duration: 90,
      tableId: 1,
      status: 'CONFIRMED',
      customer: { id: 'c1', firstName: 'Ana', lastName: 'García', email: 'ana@example.com' },
      table: { id: 1, name: 'Mesa 1' }
    });
    prisma.table.findUnique.mockResolvedValue({ id: 2, name: 'Mesa 2', isActive: true, minCapacity: 2, maxCapacity: 4, zone: { name: 'Sala' } });

    const res = await request(app)
      .post('/api/backoffice/bookings/b1/reassign')
      .set(auth)
      .send({ tableId: 2 });

    expect(res.status).toBe(200);
    expect(emitToBackoffice).toHaveBeenCalledWith(
      'reservation_updated',
      expect.objectContaining({ id: 'b1' })
    );
  });
});
