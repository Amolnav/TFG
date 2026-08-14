import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index';
const prisma = require('../config/database');
// Espía sobre el módulo compartido: evita el intento de conexión SMTP real
// del email fire-and-forget al crear la reserva.
const emailService = require('../services/emailService');
vi.spyOn(emailService, 'sendBookingConfirmation').mockResolvedValue(undefined);
const { daysFromFrozenNow } = require('./helpers/testDates');

// Fecha reservable de referencia: a 16 días del reloj congelado
const BOOKABLE_DATE = daysFromFrozenNow(16);

describe('Reservation Integration Tests', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.systemConfig.findUnique.mockResolvedValue({ key: 'opening_days', value: '0,1,2,3,4,5,6' });
    prisma.shift.findMany.mockResolvedValue([
      { id: 1, name: 'Comida', startTime: '13:00', endTime: '16:00', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], slotInterval: 30, isActive: true }
    ]);
    prisma.closure.findMany.mockResolvedValue([]);
    prisma.table.findFirst.mockResolvedValue({ maxCapacity: 10 });
    prisma.zone.count.mockResolvedValue(1);
    prisma.table.count.mockResolvedValue(10);
  });

  describe('POST /api/public/reservations', () => {
    it('debería crear una reserva con éxito', async () => {
      const bookingData = {
        date: BOOKABLE_DATE,
        time: '14:00',
        pax: 2,
        customer: {
          firstName: 'Juan',
          lastName: 'Pérez',
          email: 'juan@example.com',
          phone: '600123456'
        }
      };

      prisma.table.findMany.mockResolvedValue([
        { id: 1, name: 'Mesa 1', minCapacity: 2, maxCapacity: 4, isActive: true, zone: { name: 'Sala' } }
      ]);
      prisma.customer.findFirst.mockResolvedValue(null);
      prisma.customer.create.mockResolvedValue({
        id: 1,
        ...bookingData.customer,
        isBlacklisted: false
      });
      prisma.booking.findMany.mockResolvedValue([]);
      prisma.booking.create.mockResolvedValue({
        id: 'new-id',
        confirmationToken: 'abc123token',
        ...bookingData,
        tableId: 1,
        table: { name: 'Mesa 1', zone: { name: 'Sala' } },
        customer: bookingData.customer
      });

      const response = await request(app)
        .post('/api/public/reservations')
        .send(bookingData);

      expect(response.status).toBe(201);
      expect(response.body.data.booking.pax).toBe(2);
    });

    it('debería rechazar reservas fuera del turno configurado', async () => {
      const bookingData = {
        date: BOOKABLE_DATE,
        time: '16:00',
        pax: 2,
        customer: {
          firstName: 'Juan',
          lastName: 'Pérez',
          email: 'juan@example.com',
          phone: '600123456'
        }
      };

      prisma.customer.findFirst.mockResolvedValue(null);
      prisma.customer.create.mockResolvedValue({
        id: 1,
        ...bookingData.customer,
        isBlacklisted: false
      });

      const response = await request(app)
        .post('/api/public/reservations')
        .send(bookingData);

      expect(response.status).toBe(409);
      expect(response.body.message).toContain('turno disponible');
    });
  });
});
