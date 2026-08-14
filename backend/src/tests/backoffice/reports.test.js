import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
const prisma = require('../../config/database');
const { JWT_SECRET } = require('../../config/auth');
const { aggregateReport } = require('../../controllers/backoffice/reportsController');

const token = jwt.sign({ id: 'test', email: 'test@test.com', name: 'Test', role: 'STAFF' }, JWT_SECRET);
const auth = { Authorization: `Bearer ${token}` };

// N2.4: métricas históricas — la agregación es una función pura testeable.
describe('métricas históricas (N2.4)', () => {
  const RANGE_START = new Date('2026-03-01T00:00:00');

  function row(overrides = {}) {
    return {
      id: 'b1',
      date: new Date('2026-03-10T14:00:00'),
      pax: 2,
      status: 'COMPLETED',
      customerId: 'c1',
      customer: { firstName: 'Ana', lastName: 'García' },
      ...overrides
    };
  }

  describe('aggregateReport (pura)', () => {
    it('agrega totales, días, horas y desglose de estados (canceladas fuera)', () => {
      const rows = [
        row({ id: 'b1', date: new Date('2026-03-10T14:00:00'), pax: 2, status: 'COMPLETED' }),
        row({ id: 'b2', date: new Date('2026-03-10T14:30:00'), pax: 4, status: 'COMPLETED', customerId: 'c2', customer: { firstName: 'Luis', lastName: 'Ruiz' } }),
        row({ id: 'b3', date: new Date('2026-03-11T21:00:00'), pax: 3, status: 'NO_SHOW' }),
        row({ id: 'b4', date: new Date('2026-03-12T13:00:00'), pax: 5, status: 'CANCELLED', customerId: 'c3' })
      ];
      const firstByCustomer = new Map([
        ['c1', new Date('2025-01-01T14:00:00')], // recurrente
        ['c2', new Date('2026-03-10T14:30:00')]  // nuevo (dentro del rango)
      ]);

      const report = aggregateReport(rows, firstByCustomer, RANGE_START);

      expect(report.totals).toMatchObject({ bookings: 3, pax: 9, cancelled: 1, noShows: 1, completed: 2 });
      // Tasa de no-show sobre terminadas: 1 / (1 + 2) = 33.3%
      expect(report.totals.noShowRate).toBe(33.3);
      expect(report.byDay).toEqual([
        { date: '2026-03-10', bookings: 2, pax: 6 },
        { date: '2026-03-11', bookings: 1, pax: 3 }
      ]);
      expect(report.byHour).toEqual(
        expect.arrayContaining([
          { hour: 14, bookings: 2 },
          { hour: 21, bookings: 1 }
        ])
      );
      expect(report.statusBreakdown).toEqual({ COMPLETED: 2, NO_SHOW: 1, CANCELLED: 1 });
      expect(report.customers).toEqual({ new: 1, returning: 1 });
    });

    it('ordena el top de clientes por reservas', () => {
      const rows = [
        row({ id: 'b1', customerId: 'c1' }),
        row({ id: 'b2', customerId: 'c1', date: new Date('2026-03-15T14:00:00') }),
        row({ id: 'b3', customerId: 'c2', customer: { firstName: 'Luis', lastName: 'Ruiz' } })
      ];
      const report = aggregateReport(rows, new Map(), RANGE_START);
      expect(report.topCustomers[0]).toMatchObject({ id: 'c1', bookings: 2 });
      expect(report.topCustomers[1]).toMatchObject({ id: 'c2', bookings: 1 });
    });
  });

  describe('GET /api/backoffice/reports', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      prisma.staff.findUnique.mockResolvedValue({ id: 'test', email: 'test@test.com', name: 'Test', role: 'STAFF', isActive: true });
      prisma.booking.findMany.mockResolvedValue([]);
      prisma.booking.groupBy.mockResolvedValue([]);
    });

    it('devuelve el informe del rango pedido', async () => {
      prisma.booking.findMany.mockResolvedValue([row()]);
      prisma.booking.groupBy.mockResolvedValue([{ customerId: 'c1', _min: { date: new Date('2026-03-10T14:00:00') } }]);

      const res = await request(app)
        .get('/api/backoffice/reports?from=2026-03-01&to=2026-03-31')
        .set(auth);

      expect(res.status).toBe(200);
      expect(res.body.data.range).toEqual({ from: '2026-03-01', to: '2026-03-31' });
      expect(res.body.data.totals.bookings).toBe(1);
      expect(res.body.data.customers.new).toBe(1);
    });

    it('valida el rango: falta from/to → 400; rango invertido → 400; > 1 año → 400', async () => {
      expect((await request(app).get('/api/backoffice/reports').set(auth)).status).toBe(400);
      expect((await request(app).get('/api/backoffice/reports?from=2026-03-31&to=2026-03-01').set(auth)).status).toBe(400);
      expect((await request(app).get('/api/backoffice/reports?from=2024-01-01&to=2026-03-01').set(auth)).status).toBe(400);
    });

    it('sin token → 401', async () => {
      const res = await request(app).get('/api/backoffice/reports?from=2026-03-01&to=2026-03-31');
      expect(res.status).toBe(401);
    });
  });
});
