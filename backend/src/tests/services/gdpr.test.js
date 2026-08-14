import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
const prisma = require('../../config/database');
const { JWT_SECRET } = require('../../config/auth');
const { anonymizeCustomer, runGdprSweep } = require('../../services/gdprService');
const { FROZEN_NOW } = require('../helpers/testDates');

const adminToken = jwt.sign({ id: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'ADMIN' }, JWT_SECRET);
const staffToken = jwt.sign({ id: 'staff-1', email: 'staff@test.com', name: 'Staff', role: 'STAFF' }, JWT_SECRET);

const CUSTOMER = {
  id: 'c1234567-0000-0000-0000-000000000000',
  email: 'ana.garcia@example.com',
  phone: '+34600123456',
  firstName: 'Ana',
  lastName: 'García',
  language: 'es',
  allergens: ['marisco'],
  preferences: 'mesa junto a la ventana',
  birthday: new Date('1990-05-01'),
  tags: ['VIP', 'cumpleaños'],
  isVip: true,
  isBlacklisted: false,
  blacklistReason: null,
  totalVisits: 12,
  totalNoShows: 1,
  previousEmails: ['vieja@example.com'],
  previousPhones: ['600000001'],
  previousNames: ['Ana G.'],
  createdAt: new Date('2024-01-01'),
  bookings: [],
  notes: [],
  waitlist: []
};

function mockConfig(rows) {
  prisma.systemConfig.findMany.mockResolvedValue(
    Object.entries(rows).map(([key, value]) => ({ key, value }))
  );
}

// N4.4: RGPD — anonimizar sustituye la PII por placeholders SIN borrar filas.
describe('RGPD (N4.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig({});
    prisma.customer.findUnique.mockResolvedValue(CUSTOMER);
    prisma.customer.update.mockImplementation(async ({ data }) => ({ ...CUSTOMER, ...data }));
    prisma.customerNote.deleteMany.mockResolvedValue({ count: 2 });
    prisma.booking.updateMany.mockResolvedValue({ count: 5 });
  });

  describe('anonymizeCustomer', () => {
    it('sustituye la PII por placeholders y conserva la estadística', async () => {
      const updated = await anonymizeCustomer(CUSTOMER.id, 'Admin');

      const data = prisma.customer.update.mock.calls[0][0].data;
      expect(data.email).toBe('anon-c1234567@anonimo.local');
      expect(data.phone).toBe('000000000');
      expect(data.firstName).toBe('Cliente');
      expect(data.allergens).toEqual([]);
      expect(data.preferences).toBe(null);
      expect(data.birthday).toBe(null);
      expect(data.previousEmails).toEqual([]);
      expect(data.tags).toContain('ANONIMIZADO');
      expect(data.tags).toContain('VIP'); // etiqueta operativa, no PII
      expect(data.tags).not.toContain('cumpleaños');
      // La estadística no se toca (no aparecen en el update)
      expect(data.totalVisits).toBeUndefined();
      expect(data.totalNoShows).toBeUndefined();
      expect(updated.email).toContain('@anonimo.local');
    });

    it('limpia el texto libre y los tokens de sus reservas SIN borrar filas', async () => {
      await anonymizeCustomer(CUSTOMER.id, 'Admin');
      expect(prisma.customerNote.deleteMany).toHaveBeenCalledWith({ where: { customerId: CUSTOMER.id } });
      expect(prisma.booking.updateMany).toHaveBeenCalledWith({
        where: { customerId: CUSTOMER.id },
        data: { specialRequests: null, confirmationToken: null, reconfirmToken: null }
      });
      // Nunca se borran reservas ni clientes
      expect(prisma.booking.update).not.toHaveBeenCalled();
    });

    it('es idempotente: un cliente ya anonimizado no se vuelve a tocar', async () => {
      prisma.customer.findUnique.mockResolvedValue({ ...CUSTOMER, email: 'anon-x@anonimo.local' });
      await anonymizeCustomer(CUSTOMER.id, 'Admin');
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });
  });

  describe('runGdprSweep (retención automática)', () => {
    it('desactivado por defecto (gdpr_retention_months=0)', async () => {
      const result = await runGdprSweep(FROZEN_NOW);
      expect(result).toEqual({ anonymized: 0 });
      expect(prisma.customer.findMany).not.toHaveBeenCalled();
    });

    it('con retención configurada anonimiza los clientes sin actividad', async () => {
      mockConfig({ gdpr_retention_months: '24' });
      prisma.customer.findMany.mockResolvedValue([{ id: CUSTOMER.id }]);

      const result = await runGdprSweep(FROZEN_NOW);

      expect(result.anonymized).toBe(1);
      const where = prisma.customer.findMany.mock.calls[0][0].where;
      expect(where.email.not.endsWith).toBe('@anonimo.local');
      expect(where.bookings.none.date.gte).toBeInstanceOf(Date);
      expect(prisma.customer.update).toHaveBeenCalled();
    });
  });

  describe('endpoints', () => {
    beforeEach(() => {
      prisma.staff.findUnique.mockImplementation(({ where }) =>
        Promise.resolve(
          where.id === 'admin-1'
            ? { id: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'ADMIN', isActive: true }
            : { id: 'staff-1', email: 'staff@test.com', name: 'Staff', role: 'STAFF', isActive: true }
        )
      );
    });

    it('GET /:id/export descarga el perfil completo como adjunto', async () => {
      const res = await request(app)
        .get(`/api/backoffice/customers/${CUSTOMER.id}/export`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.body.data.customer.email).toBe(CUSTOMER.email);
      expect(res.body.data).toHaveProperty('bookings');
      expect(res.body.data).toHaveProperty('exportedAt');
    });

    it('POST /:id/anonymize es solo ADMIN (STAFF → 403)', async () => {
      const forbidden = await request(app)
        .post(`/api/backoffice/customers/${CUSTOMER.id}/anonymize`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(forbidden.status).toBe(403);

      const ok = await request(app)
        .post(`/api/backoffice/customers/${CUSTOMER.id}/anonymize`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(ok.status).toBe(200);
      expect(ok.body.data.customer.email).toContain('@anonimo.local');
    });
  });
});
