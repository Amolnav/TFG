import { describe, it, expect, vi, beforeEach } from 'vitest';
const prisma = require('../../config/database');
const emailService = require('../../services/emailService');
const sendBookingReminder = vi.spyOn(emailService, 'sendBookingReminder').mockResolvedValue(undefined);
const sendBookingCancellation = vi.spyOn(emailService, 'sendBookingCancellation').mockResolvedValue(undefined);
const socketManager = require('../../socketManager');
const emitToBackoffice = vi.spyOn(socketManager, 'emitToBackoffice').mockImplementation(() => {});
const { runReminderSweep, resetNotifiedPending } = require('../../jobs/reminderJobs');
const { FROZEN_NOW } = require('../helpers/testDates');

// N1.2: el barrido corre con el reloj congelado del setup global
// (FROZEN_NOW = 2026-04-15T10:00). Idempotencia: emailSentAt es la guarda.

function hoursFromNow(h) {
  return new Date(FROZEN_NOW.getTime() + h * 60 * 60 * 1000);
}

function mockConfig(rows) {
  prisma.systemConfig.findMany.mockResolvedValue(
    Object.entries(rows).map(([key, value]) => ({ key, value }))
  );
}

const CUSTOMER = { id: 'c1', firstName: 'Ana', lastName: 'García', email: 'ana@example.com', language: 'es' };

function baseBooking(overrides = {}) {
  return {
    id: 'b1',
    date: hoursFromNow(20),
    pax: 2,
    duration: 90,
    status: 'CONFIRMED',
    confirmationToken: 'conf-token-0001',
    reconfirmToken: null,
    emailSentAt: null,
    reconfirmedAt: null,
    customer: CUSTOMER,
    table: { id: 1, name: 'Mesa 1', zone: { name: 'Sala' } },
    ...overrides
  };
}

describe('barrido de recordatorios y reconfirmación (N1.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetNotifiedPending();
    mockConfig({});
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.update.mockResolvedValue({});
  });

  describe('fase 1: recordatorios', () => {
    it('envía el recordatorio a las reservas dentro de la ventana y marca emailSentAt', async () => {
      const booking = baseBooking();
      // Primera query (recordatorios) devuelve la reserva; segunda (no reconfirmadas), nada
      prisma.booking.findMany
        .mockResolvedValueOnce([booking])
        .mockResolvedValueOnce([]);

      const result = await runReminderSweep(FROZEN_NOW);

      expect(result.reminders).toBe(1);
      // La guarda se escribe ANTES de enviar: reconfirmToken + emailSentAt
      expect(prisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b1' },
          data: expect.objectContaining({
            emailSentAt: FROZEN_NOW,
            reconfirmToken: expect.stringMatching(/^[0-9a-f]{32}$/)
          })
        })
      );
      expect(sendBookingReminder).toHaveBeenCalledTimes(1);
      const [sentBooking] = sendBookingReminder.mock.calls[0];
      expect(sentBooking.reconfirmToken).toMatch(/^[0-9a-f]{32}$/);
    });

    it('la ventana del recordatorio sale de la configuración', async () => {
      mockConfig({ reminder_hours_before: '48' });
      await runReminderSweep(FROZEN_NOW);

      const where = prisma.booking.findMany.mock.calls[0][0].where;
      expect(where.emailSentAt).toBe(null);
      expect(where.date.lte).toEqual(hoursFromNow(48));
      expect(where.date.gt).toEqual(FROZEN_NOW);
    });

    it('con reminder_enabled=false no hace nada', async () => {
      mockConfig({ reminder_enabled: 'false' });
      const result = await runReminderSweep(FROZEN_NOW);
      expect(result).toEqual({ reminders: 0, unconfirmed: 0 });
      expect(prisma.booking.findMany).not.toHaveBeenCalled();
    });
  });

  describe('fase 2: reservas sin reconfirmar cerca de la hora', () => {
    it("policy 'notify' (default): avisa al panel UNA vez y no toca la reserva", async () => {
      const booking = baseBooking({ date: hoursFromNow(3), emailSentAt: hoursFromNow(-20) });
      prisma.booking.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([booking]);

      const result = await runReminderSweep(FROZEN_NOW);
      expect(result.unconfirmed).toBe(1);
      expect(prisma.booking.update).not.toHaveBeenCalled();
      expect(emitToBackoffice).toHaveBeenCalledWith(
        'reconfirmation_pending',
        expect.objectContaining({ id: 'b1', customerName: 'Ana García' })
      );

      // Segundo barrido: el aviso no se repite (dedup en memoria)
      prisma.booking.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([booking]);
      emitToBackoffice.mockClear();
      await runReminderSweep(FROZEN_NOW);
      expect(emitToBackoffice).not.toHaveBeenCalled();
    });

    it("policy 'autocancel': cancela, avisa al panel y envía email de cancelación", async () => {
      mockConfig({ reminder_unconfirmed_policy: 'autocancel', reminder_autocancel_hours_before: '4' });
      const booking = baseBooking({ date: hoursFromNow(3), emailSentAt: hoursFromNow(-20) });
      prisma.booking.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([booking]);

      const result = await runReminderSweep(FROZEN_NOW);

      expect(result.unconfirmed).toBe(1);
      expect(prisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b1' },
          data: expect.objectContaining({ status: 'CANCELLED' })
        })
      );
      expect(emitToBackoffice).toHaveBeenCalledWith(
        'reservation_cancelled',
        expect.objectContaining({ id: 'b1' })
      );
      expect(sendBookingCancellation).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'b1' }),
        expect.objectContaining({ email: CUSTOMER.email }),
        { byRestaurant: true }
      );
    });

    it('la query de no-reconfirmadas exige recordatorio enviado y reconfirmedAt null', async () => {
      await runReminderSweep(FROZEN_NOW);
      const where = prisma.booking.findMany.mock.calls[1][0].where;
      expect(where.emailSentAt).toEqual({ not: null });
      expect(where.reconfirmedAt).toBe(null);
      expect(where.status).toBe('CONFIRMED');
    });
  });
});
