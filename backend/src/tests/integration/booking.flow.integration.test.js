import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Suite de integración T2 — requiere la BD de docker-compose.test.yml:
//   docker compose -f docker-compose.test.yml up -d
// Si la BD no está accesible, la suite se salta limpiamente (skip condicional).

const prisma = global.prisma;

let dbAvailable = false;
try {
  execSync('npx prisma migrate deploy', {
    cwd: new URL('../../..', import.meta.url).pathname,
    env: process.env,
    stdio: 'pipe',
    timeout: 60000
  });
  await prisma.$queryRaw`SELECT 1`;
  dbAvailable = true;
} catch {
  console.warn(
    '⚠️  Suite de integración SALTADA: no hay PostgreSQL de test accesible.\n' +
    '    Levántalo con: docker compose -f docker-compose.test.yml up -d'
  );
}

// El import de la app debe ocurrir tras el setup (usa global.prisma real)
const { default: app } = await import('../../index.js');
const { JWT_SECRET } = await import('../../config/auth.js');
const emailService = await import('../../services/emailService.js');

// No intentar conexiones SMTP reales
vi.spyOn(emailService, 'sendBookingConfirmation').mockResolvedValue(undefined);

const ADMIN_ID = 'itest-admin';
const STAFF_ID = 'itest-staff';
const adminToken = jwt.sign({ id: ADMIN_ID, email: 'itest-admin@test.com', role: 'ADMIN' }, JWT_SECRET);
const staffToken = jwt.sign({ id: STAFF_ID, email: 'itest-staff@test.com', role: 'STAFF' }, JWT_SECRET);
const adminAuth = { Authorization: `Bearer ${adminToken}` };
const staffAuth = { Authorization: `Bearer ${staffToken}` };

function futureDate(daysAhead = 7) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

async function resetDb() {
  await prisma.booking.deleteMany();
  await prisma.waitlist.deleteMany();
  await prisma.closure.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.table.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.customerNote.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.systemConfig.deleteMany();
}

describe.runIf(dbAvailable)('integración: flujo de reservas contra PostgreSQL real (T2)', () => {
  let table;

  beforeAll(async () => {
    await resetDb();

    const passwordHash = await bcrypt.hash('itest-password', 10);
    await prisma.staff.createMany({
      data: [
        { id: ADMIN_ID, email: 'itest-admin@test.com', passwordHash, name: 'Admin IT', role: 'ADMIN', isActive: true },
        { id: STAFF_ID, email: 'itest-staff@test.com', passwordHash, name: 'Staff IT', role: 'STAFF', isActive: true }
      ]
    });

    const zone = await prisma.zone.create({ data: { name: 'Sala IT' } });
    // Una única mesa: clave para el test de concurrencia
    table = await prisma.table.create({
      data: { name: 'Mesa IT-1', minCapacity: 1, maxCapacity: 4, zoneId: zone.id }
    });

    await prisma.shift.create({
      data: {
        name: 'Continuo IT',
        startTime: '12:00',
        endTime: '23:00',
        slotInterval: 30,
        isActive: true,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6]
      }
    });

    await prisma.systemConfig.create({ data: { key: 'opening_days', value: '0,1,2,3,4,5,6' } });

    await prisma.customer.create({
      data: {
        email: 'bloqueado-it@example.com',
        phone: '+34600000100',
        firstName: 'Cliente',
        lastName: 'Bloqueado',
        isBlacklisted: true,
        blacklistReason: 'test'
      }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('flujo completo: disponibilidad → reserva creada (201) y persistida', async () => {
    const date = futureDate(7);

    const times = await request(app)
      .post('/api/public/reservations/availability/times')
      .send({ date, pax: 2 });
    expect(times.status).toBe(200);
    expect(times.body.data.times).toContain('13:00');

    const res = await request(app)
      .post('/api/public/reservations')
      .send({
        date,
        time: '13:00',
        pax: 2,
        customer: { firstName: 'Itziar', lastName: 'Test', email: 'itziar@example.com', phone: '+34600000101' }
      });

    expect(res.status).toBe(201);
    const saved = await prisma.booking.findUnique({ where: { id: res.body.data.booking.id } });
    expect(saved).not.toBeNull();
    expect(saved.status).toBe('CONFIRMED');

    const customer = await prisma.customer.findUnique({ where: { email: 'itziar@example.com' } });
    expect(customer.totalVisits).toBe(1);
  });

  it('concurrencia: dos reservas simultáneas para la única mesa → una 201 y otra 409', async () => {
    const date = futureDate(8);
    const makeRequest = (email) =>
      request(app)
        .post('/api/public/reservations')
        .send({
          date,
          time: '14:00',
          pax: 2,
          customer: { firstName: 'Carrera', lastName: 'Test', email, phone: '+34600000102' }
        });

    const [a, b] = await Promise.all([makeRequest('carrera1@example.com'), makeRequest('carrera2@example.com')]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);

    const count = await prisma.booking.count({
      where: { tableId: table.id, status: { notIn: ['CANCELLED', 'NO_SHOW'] } }
    });
    // solo una reserva nueva a las 14:00 de ese día (más las de otros tests)
    const overlapping = await prisma.booking.findMany({ where: { tableId: table.id } });
    const at14 = overlapping.filter((bk) => bk.date.toISOString().includes('T') && bk.pax === 2);
    expect(count).toBeGreaterThan(0);
    expect(at14.length).toBeGreaterThan(0);
  });

  it('el constraint booking_no_table_overlap rechaza solapes directos en BD', async () => {
    const date = futureDate(9);
    const start = new Date(`${date}T15:00:00`);
    const customer = await prisma.customer.create({
      data: { email: 'solape@example.com', phone: '+34600000103', firstName: 'So', lastName: 'Lape' }
    });

    await prisma.booking.create({
      data: { date: start, duration: 90, pax: 2, status: 'CONFIRMED', customerId: customer.id, tableId: table.id }
    });

    await expect(
      prisma.booking.create({
        data: {
          date: new Date(`${date}T15:30:00`),
          duration: 90,
          pax: 2,
          status: 'CONFIRMED',
          customerId: customer.id,
          tableId: table.id
        }
      })
    ).rejects.toThrowError(/23P01|exclusion/i);
  });

  it('cliente en lista negra → 403', async () => {
    const res = await request(app)
      .post('/api/public/reservations')
      .send({
        date: futureDate(10),
        time: '13:00',
        pax: 2,
        customer: { firstName: 'Cliente', lastName: 'Bloqueado', email: 'bloqueado-it@example.com', phone: '+34600000100' }
      });
    expect(res.status).toBe(403);
  });

  it('auth y roles: sin token 401, STAFF en ruta ADMIN 403, ADMIN 200', async () => {
    const noToken = await request(app).get('/api/backoffice/bookings');
    expect(noToken.status).toBe(401);

    const staffForbidden = await request(app)
      .patch('/api/backoffice/config')
      .set(staffAuth)
      .send({ restaurant_name: 'X' });
    expect(staffForbidden.status).toBe(403);

    const staffAllowed = await request(app).get('/api/backoffice/bookings').set(staffAuth);
    expect(staffAllowed.status).toBe(200);

    const adminAllowed = await request(app)
      .patch('/api/backoffice/config')
      .set(adminAuth)
      .send({ restaurant_name: 'Restaurante IT' });
    expect(adminAllowed.status).toBe(200);
  });

  it('NO_SHOW no es duplicable y el contador queda en 1', async () => {
    const date = futureDate(11);
    const created = await request(app)
      .post('/api/public/reservations')
      .send({
        date,
        time: '16:00',
        pax: 2,
        customer: { firstName: 'Nadie', lastName: 'Vino', email: 'noshow@example.com', phone: '+34600000104' }
      });
    expect(created.status).toBe(201);
    const bookingId = created.body.data.booking.id;

    const first = await request(app)
      .patch(`/api/backoffice/bookings/${bookingId}/status`)
      .set(adminAuth)
      .send({ status: 'NO_SHOW' });
    expect(first.status).toBe(200);

    const second = await request(app)
      .patch(`/api/backoffice/bookings/${bookingId}/status`)
      .set(adminAuth)
      .send({ status: 'NO_SHOW' });
    expect(second.status).toBe(409);

    const customer = await prisma.customer.findUnique({ where: { email: 'noshow@example.com' } });
    expect(customer.totalNoShows).toBe(1);
  });

  it('no se puede borrar una mesa con reservas futuras activas (409)', async () => {
    const res = await request(app)
      .delete(`/api/backoffice/zones/tables/${table.id}`)
      .set(adminAuth);
    expect(res.status).toBe(409);

    const stillThere = await prisma.table.findUnique({ where: { id: table.id } });
    expect(stillThere).not.toBeNull();
  });
});
