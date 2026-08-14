import { describe, it, expect, vi, beforeEach } from 'vitest';
const prisma = require('../../config/database');
const { findOrCreateCustomer } = require('../../services/customerService');

const baseCustomer = {
  id: 'c1',
  email: 'ana@example.com',
  phone: '600111222',
  firstName: 'Ana',
  lastName: 'García',
  allergens: [],
  previousEmails: ['ana@example.com'],
  previousPhones: ['600111222'],
  previousNames: ['Ana García'],
  totalVisits: 3
};

// BUG-09: el matching por teléfono permitía secuestrar la ficha de otro
// cliente (sobrescribiendo su email y nombre), y totalVisits se incrementaba
// aunque la reserva fallara después.
describe('customerService.findOrCreateCustomer (BUG-09)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.customer.update.mockResolvedValue({ ...baseCustomer });
    prisma.customer.create.mockImplementation(async ({ data }) => ({ id: 'nuevo', ...data }));
    prisma.customer.findUnique.mockResolvedValue(null);
  });

  it('la búsqueda de identidad se hace SOLO por email, nunca por teléfono', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);

    await findOrCreateCustomer('pepe@example.com', {
      firstName: 'Pepe',
      lastName: 'López',
      phone: '600111222' // teléfono de Ana
    });

    const where = prisma.customer.findFirst.mock.calls[0][0].where;
    expect(JSON.stringify(where)).not.toContain('phone');
    expect(prisma.customer.create).toHaveBeenCalled();
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('un cliente nuevo se crea con totalVisits = 0 (la visita se registra al confirmar la reserva)', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);

    const { customer, isNew } = await findOrCreateCustomer('pepe@example.com', {
      firstName: 'Pepe',
      lastName: 'López',
      phone: '600999888'
    });

    expect(isNew).toBe(true);
    expect(customer.totalVisits).toBe(0);
  });

  it('un cliente existente (por email) se actualiza sin incrementar totalVisits', async () => {
    prisma.customer.findFirst.mockResolvedValue({ ...baseCustomer });

    await findOrCreateCustomer('ana@example.com', {
      firstName: 'Ana',
      lastName: 'García',
      phone: '600111222'
    });

    expect(prisma.customer.update).toHaveBeenCalled();
    const updateData = prisma.customer.update.mock.calls[0][0].data;
    expect(updateData.totalVisits).toBeUndefined();
  });

  it('si el email casó por previousEmails pero ya pertenece a otro cliente, no se sobrescribe', async () => {
    // Ana cambió su email a ana.nueva@example.com; su email antiguo lo tiene ahora otro cliente
    prisma.customer.findFirst.mockResolvedValue({
      ...baseCustomer,
      email: 'ana.nueva@example.com',
      previousEmails: ['ana@example.com', 'ana.nueva@example.com']
    });
    prisma.customer.findUnique.mockResolvedValue({ id: 'otro-cliente', email: 'ana@example.com' });

    await findOrCreateCustomer('ana@example.com', {
      firstName: 'Ana',
      lastName: 'García',
      phone: '600111222'
    });

    const updateData = prisma.customer.update.mock.calls[0][0].data;
    expect(updateData.email).toBeUndefined();
  });
});
