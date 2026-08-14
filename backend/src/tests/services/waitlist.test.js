import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../index';
const prisma = require('../../config/database');
const emailService = require('../../services/emailService');
const sendWaitlistAvailable = vi.spyOn(emailService, 'sendWaitlistAvailable').mockResolvedValue(undefined);
const socketManager = require('../../socketManager');
const emitToBackoffice = vi.spyOn(socketManager, 'emitToBackoffice').mockImplementation(() => {});
const waitlistService = require('../../services/waitlistService');
const { FROZEN_NOW, daysFromFrozenNow } = require('../helpers/testDates');
const { combineDateAndTime } = require('../../utils/dateHelpers');

// N1.4: lista de espera sobre el modelo Waitlist existente. El scheduler
// caduca los avisos (waitlist_hold_hours) y pasa al siguiente; notifiedAt es
// la guarda de aviso único.

const FUTURE_DATE = daysFromFrozenNow(5);
const CUSTOMER = {
  id: 'c1',
  firstName: 'Ana',
  lastName: 'García',
  email: 'ana@example.com',
  phone: '600123456',
  language: 'es',
  previousNames: [],
  previousEmails: [],
  previousPhones: [],
  allergens: []
};

function mockConfig(rows) {
  prisma.systemConfig.findMany.mockResolvedValue(
    Object.entries(rows).map(([key, value]) => ({ key, value }))
  );
}

function entry(overrides = {}) {
  return {
    id: 'w1',
    date: new Date(`${FUTURE_DATE}T00:00:00`),
    pax: 2,
    notes: null,
    isResolved: false,
    notifiedAt: null,
    resolvedAt: null,
    customerId: 'c1',
    createdAt: FROZEN_NOW,
    customer: CUSTOMER,
    ...overrides
  };
}

describe('lista de espera (N1.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig({});
    prisma.waitlist.findFirst.mockResolvedValue(null);
    prisma.waitlist.findMany.mockResolvedValue([]);
    prisma.waitlist.create.mockImplementation(async ({ data }) => ({ ...entry(), ...data, customer: CUSTOMER }));
    prisma.waitlist.update.mockResolvedValue({});
    prisma.waitlist.updateMany.mockResolvedValue({ count: 0 });
    prisma.table.findFirst.mockResolvedValue({ maxCapacity: 10 });
  });

  describe('POST /api/public/reservations/waitlist', () => {
    it('crea la entrada, emite socket al panel y responde 201', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      prisma.customer.findUnique.mockResolvedValue(null);
      prisma.customer.create.mockResolvedValue(CUSTOMER);

      const res = await request(app)
        .post('/api/public/reservations/waitlist')
        .send({
          date: FUTURE_DATE,
          pax: 2,
          customer: { firstName: 'Ana', lastName: 'García', email: 'ana@example.com', phone: '600123456' }
        });

      expect(res.status).toBe(201);
      expect(prisma.waitlist.create).toHaveBeenCalled();
      expect(emitToBackoffice).toHaveBeenCalledWith(
        'waitlist_joined',
        expect.objectContaining({ pax: 2 })
      );
    });

    it('es idempotente: el mismo cliente y día no se duplica (200)', async () => {
      prisma.customer.findFirst.mockResolvedValue(CUSTOMER);
      prisma.customer.findUnique.mockResolvedValue(CUSTOMER);
      prisma.customer.update.mockResolvedValue(CUSTOMER);
      prisma.waitlist.findFirst.mockResolvedValue(entry());

      const res = await request(app)
        .post('/api/public/reservations/waitlist')
        .send({
          date: FUTURE_DATE,
          pax: 2,
          customer: { firstName: 'Ana', lastName: 'García', email: 'ana@example.com', phone: '600123456' }
        });

      expect(res.status).toBe(200);
      expect(res.body.data.waitlist.alreadyJoined).toBe(true);
      expect(prisma.waitlist.create).not.toHaveBeenCalled();
    });

    it('con waitlist_enabled=false responde 404', async () => {
      mockConfig({ waitlist_enabled: 'false' });
      const res = await request(app)
        .post('/api/public/reservations/waitlist')
        .send({ date: FUTURE_DATE, pax: 2, customer: {} });
      expect(res.status).toBe(404);
    });
  });

  describe('notifyNextForDate (al cancelarse una reserva)', () => {
    it('avisa al primero compatible: marca notifiedAt ANTES de enviar el email', async () => {
      const first = entry();
      prisma.waitlist.findFirst.mockResolvedValue(first);

      const booking = {
        id: 'b1',
        date: combineDateAndTime(FUTURE_DATE, '14:00'),
        pax: 2,
        table: { maxCapacity: 4 }
      };
      const notified = await waitlistService.notifyNextForDate(booking);

      expect(notified).toBe(true);
      expect(prisma.waitlist.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'w1' },
          data: expect.objectContaining({ notifiedAt: expect.any(Date) })
        })
      );
      expect(sendWaitlistAvailable).toHaveBeenCalledTimes(1);
      const [entryArg, customerArg, optionsArg] = sendWaitlistAvailable.mock.calls[0];
      expect(entryArg.pax).toBe(2);
      expect(customerArg.email).toBe(CUSTOMER.email);
      expect(optionsArg.bookUrl).toContain(`/reservar?date=${FUTURE_DATE}&pax=2`);

      // La cola solo considera entradas sin avisar, del día, que quepan en la mesa
      const where = prisma.waitlist.findFirst.mock.calls[0][0].where;
      expect(where.notifiedAt).toBe(null);
      expect(where.isResolved).toBe(false);
      expect(where.pax).toEqual({ lte: 4 });
    });

    it('sin candidatos no envía nada', async () => {
      const notified = await waitlistService.notifyNextForDate({
        id: 'b1',
        date: combineDateAndTime(FUTURE_DATE, '14:00'),
        table: null
      });
      expect(notified).toBe(false);
      expect(sendWaitlistAvailable).not.toHaveBeenCalled();
    });
  });

  describe('runWaitlistSweep (caducidad y avance de la cola)', () => {
    it('caduca los avisos antiguos y avisa al siguiente del mismo día', async () => {
      // Avisado hace 3h con hold de 2h → caducado
      const expiredEntry = entry({ id: 'w1', notifiedAt: new Date(FROZEN_NOW.getTime() - 3 * 3600 * 1000) });
      const nextEntry = entry({ id: 'w2', customerId: 'c2', customer: { ...CUSTOMER, id: 'c2', email: 'otro@example.com' } });
      prisma.waitlist.findMany.mockResolvedValue([expiredEntry]);
      prisma.waitlist.findFirst.mockResolvedValue(nextEntry);

      const result = await waitlistService.runWaitlistSweep(FROZEN_NOW);

      expect(result).toEqual({ expired: 1, notified: 1 });
      // El caducado queda resuelto
      expect(prisma.waitlist.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'w1' },
          data: expect.objectContaining({ isResolved: true })
        })
      );
      // El siguiente recibe el aviso
      expect(prisma.waitlist.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'w2' },
          data: expect.objectContaining({ notifiedAt: expect.any(Date) })
        })
      );
      expect(sendWaitlistAvailable).toHaveBeenCalledTimes(1);
      expect(sendWaitlistAvailable.mock.calls[0][1].email).toBe('otro@example.com');
    });

    it('la ventana de caducidad sale de la configuración', async () => {
      mockConfig({ waitlist_hold_hours: '6' });
      await waitlistService.runWaitlistSweep(FROZEN_NOW);
      const where = prisma.waitlist.findMany.mock.calls[0][0].where;
      expect(FROZEN_NOW.getTime() - where.notifiedAt.lt.getTime()).toBe(6 * 3600 * 1000);
    });
  });

  it('resolveForCustomerAndDate marca resueltas las entradas del cliente ese día', async () => {
    prisma.waitlist.updateMany.mockResolvedValue({ count: 1 });
    const count = await waitlistService.resolveForCustomerAndDate('c1', FUTURE_DATE);
    expect(count).toBe(1);
    const args = prisma.waitlist.updateMany.mock.calls[0][0];
    expect(args.where.customerId).toBe('c1');
    expect(args.data).toMatchObject({ isResolved: true });
  });

  describe('endpoints de backoffice', () => {
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../../config/auth');
    const token = jwt.sign({ id: 'test', email: 'test@test.com', name: 'Test', role: 'STAFF' }, JWT_SECRET);
    const auth = { Authorization: `Bearer ${token}` };

    beforeEach(() => {
      prisma.staff.findUnique.mockResolvedValue({ id: 'test', email: 'test@test.com', name: 'Test', role: 'STAFF', isActive: true });
    });

    it('GET /api/backoffice/waitlist lista las entradas pendientes', async () => {
      prisma.waitlist.findMany.mockResolvedValue([entry()]);
      const res = await request(app).get('/api/backoffice/waitlist').set(auth);
      expect(res.status).toBe(200);
      expect(res.body.data.waitlist).toHaveLength(1);
      expect(prisma.waitlist.findMany.mock.calls[0][0].where.isResolved).toBe(false);
    });

    it('PATCH /:id/resolve marca la entrada como resuelta', async () => {
      prisma.waitlist.findFirst.mockResolvedValue(entry());
      const res = await request(app).patch('/api/backoffice/waitlist/w1/resolve').set(auth);
      expect(res.status).toBe(200);
      expect(prisma.waitlist.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'w1' }, data: expect.objectContaining({ isResolved: true }) })
      );
    });

    it('DELETE /:id elimina la entrada', async () => {
      prisma.waitlist.findFirst.mockResolvedValue(entry());
      const res = await request(app).delete('/api/backoffice/waitlist/w1').set(auth);
      expect(res.status).toBe(200);
      expect(prisma.waitlist.delete).toHaveBeenCalledWith({ where: { id: 'w1' } });
    });

    it('sin token → 401', async () => {
      const res = await request(app).get('/api/backoffice/waitlist');
      expect(res.status).toBe(401);
    });
  });
});
