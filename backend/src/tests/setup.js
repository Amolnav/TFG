import { vi, beforeEach } from 'vitest';
const { FROZEN_NOW } = require('./helpers/testDates');

// Congelar SOLO Date (no los timers) para que las fechas de los tests sean
// deterministas y la suite no caduque con el calendario (BUG-25).
vi.useFakeTimers({ now: FROZEN_NOW, toFake: ['Date'] });

const mockPrisma = {
  // Por defecto el staff autenticado existe, está activo y es ADMIN
  // (BUG-03: authMiddleware re-verifica en BD). Los tests de autorización
  // sobreescriben este mock según el caso.
  staff: {
    findUnique: vi.fn().mockResolvedValue({
      id: 'test',
      email: 'test@test.com',
      name: 'Test',
      role: 'ADMIN',
      isActive: true,
    }),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  booking: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    groupBy: vi.fn().mockResolvedValue([]),
  },
  // N1.4: lista de espera
  waitlist: {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    delete: vi.fn().mockResolvedValue({}),
  },
  // N2.5/N3.4: historial de eventos de reserva
  bookingEvent: {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({}),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  shift: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  customer: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  // N4.4: RGPD (anonimización borra las notas y limpia campos de reservas)
  customerNote: {
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  table: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  zone: {
    // Default seguro: el payload público incluye las zonas activas (N3.2)
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  menuCategory: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  menuItem: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  systemConfig: {
    findUnique: vi.fn(),
    // Default seguro: sin filas de config → defaults neutros del schema
    // (N4.1: verifyCaptcha lee config en todos los POST públicos)
    findMany: vi.fn().mockResolvedValue([]),
    upsert: vi.fn(),
  },
  closure: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  $connect: vi.fn().mockResolvedValue(true),
  $disconnect: vi.fn().mockResolvedValue(true),
  $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  $executeRaw: vi.fn().mockResolvedValue(true),
};

mockPrisma.$transaction = vi.fn(async (callback) => callback(mockPrisma));

// Inyectar en global para que database.js lo use (Singleton pattern)
global.prisma = mockPrisma;

// M1/M4: la caché de configuración y las reglas de negocio se resetean entre
// tests (con Date congelado el TTL de la caché no expira nunca solo).
beforeEach(() => {
  require('../services/configService').invalidateConfigCache();
  require('../config/bookingRules').resetBookingRules();
});

// Mock de Socket.io
vi.mock('../socketManager', () => ({
  initSocketServer: vi.fn(),
  emitToBackoffice: vi.fn(),
  getIO: vi.fn(() => ({
    emit: vi.fn()
  }))
}));

// Mock del servicio de email: evita intentos de conexión SMTP reales en los tests
vi.mock('../services/emailService', () => ({
  sendBookingConfirmation: vi.fn().mockResolvedValue(undefined),
  // N1.3: emails de ciclo de vida
  sendBookingCancellation: vi.fn().mockResolvedValue(undefined),
  sendBookingModification: vi.fn().mockResolvedValue(undefined),
  sendClosureNotice: vi.fn().mockResolvedValue(undefined),
  // N1.2: recordatorio con reconfirmación
  sendBookingReminder: vi.fn().mockResolvedValue(undefined),
  // N3.4: petición de reseña post-visita
  sendReviewRequest: vi.fn().mockResolvedValue(undefined),
  // N1.4: aviso de hueco libre a la lista de espera
  sendWaitlistAvailable: vi.fn().mockResolvedValue(undefined),
}));
