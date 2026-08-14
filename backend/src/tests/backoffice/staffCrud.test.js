import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../index';
const prisma = require('../../config/database');
const { JWT_SECRET } = require('../../config/auth');

const adminToken = jwt.sign({ id: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'ADMIN' }, JWT_SECRET);
const staffToken = jwt.sign({ id: 'staff-1', email: 'staff@test.com', name: 'Staff', role: 'STAFF' }, JWT_SECRET);

const ADMIN_USER = { id: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'ADMIN', isActive: true };
const STAFF_USER = { id: 'staff-1', email: 'staff@test.com', name: 'Staff', role: 'STAFF', isActive: true };
const OTHER_ADMIN = { id: 'admin-2', email: 'admin2@test.com', name: 'Admin Dos', role: 'ADMIN', isActive: true };

// N2.1: CRUD de personal. Solo ADMIN gestiona el equipo; nunca se puede
// desactivar/degradar/borrar al último ADMIN activo ni auto-mutilarse la cuenta.
describe('CRUD de staff (N2.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // authMiddleware y el controller comparten staff.findUnique: se resuelve por id
    prisma.staff.findUnique.mockImplementation(({ where }) => {
      if (where.id === 'admin-1') return Promise.resolve(ADMIN_USER);
      if (where.id === 'staff-1') return Promise.resolve(STAFF_USER);
      if (where.id === 'admin-2') return Promise.resolve(OTHER_ADMIN);
      return Promise.resolve(null);
    });
    prisma.staff.findMany.mockResolvedValue([ADMIN_USER, STAFF_USER]);
    prisma.staff.count.mockResolvedValue(0);
    prisma.staff.create.mockImplementation(({ data, select }) => {
      void select;
      return Promise.resolve({ id: 'new-1', email: data.email, name: data.name, role: data.role, isActive: true, createdAt: new Date() });
    });
    prisma.staff.update.mockImplementation(({ where, data }) =>
      Promise.resolve({ ...STAFF_USER, id: where.id, ...data, passwordHash: undefined })
    );
    prisma.staff.delete.mockResolvedValue(STAFF_USER);
  });

  describe('autorización', () => {
    it('un STAFF no puede listar el equipo (403)', async () => {
      const res = await request(app)
        .get('/api/backoffice/staff')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(403);
      expect(prisma.staff.findMany).not.toHaveBeenCalled();
    });

    it('un STAFF no puede crear usuarios (403)', async () => {
      const res = await request(app)
        .post('/api/backoffice/staff')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ email: 'x@x.com', name: 'Nuevo', password: 'abcd1234' });
      expect(res.status).toBe(403);
      expect(prisma.staff.create).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/backoffice/staff', () => {
    it('devuelve la lista para un ADMIN sin exponer passwordHash', async () => {
      const res = await request(app)
        .get('/api/backoffice/staff')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.staff).toHaveLength(2);
      // El select del findMany nunca debe pedir el hash
      const args = prisma.staff.findMany.mock.calls[0][0];
      expect(args.select.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });
  });

  describe('POST /api/backoffice/staff', () => {
    it('crea un usuario con contraseña válida y guarda un hash bcrypt', async () => {
      const res = await request(app)
        .post('/api/backoffice/staff')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: '  Nuevo@Test.com ', name: 'Nuevo Camarero', password: 'abcd1234', role: 'STAFF' });
      expect(res.status).toBe(201);
      const createArgs = prisma.staff.create.mock.calls[0][0];
      expect(createArgs.data.email).toBe('nuevo@test.com');
      expect(createArgs.data.password).toBeUndefined();
      expect(createArgs.data.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(createArgs.data.role).toBe('STAFF');
    });

    it('rechaza contraseñas débiles (400 WEAK_PASSWORD)', async () => {
      for (const password of ['corta1', 'soloerasletras', '12345678']) {
        prisma.staff.create.mockClear();
        const res = await request(app)
          .post('/api/backoffice/staff')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ email: 'x@x.com', name: 'Nuevo', password });
        expect(res.status).toBe(400);
        expect(res.body.type).toBe('WEAK_PASSWORD');
        expect(prisma.staff.create).not.toHaveBeenCalled();
      }
    });

    it('rechaza email inválido y nombre corto (400)', async () => {
      const res = await request(app)
        .post('/api/backoffice/staff')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'no-es-email', name: 'N', password: 'abcd1234' });
      expect(res.status).toBe(400);
      expect(prisma.staff.create).not.toHaveBeenCalled();
    });

    it('rechaza roles desconocidos (400)', async () => {
      const res = await request(app)
        .post('/api/backoffice/staff')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'x@x.com', name: 'Nuevo', password: 'abcd1234', role: 'SUPERADMIN' });
      expect(res.status).toBe(400);
      expect(prisma.staff.create).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/backoffice/staff/:id — guardas', () => {
    it('no permite degradar al último ADMIN activo (409 LAST_ADMIN)', async () => {
      prisma.staff.count.mockResolvedValue(0); // no hay otros ADMIN activos
      const res = await request(app)
        .patch('/api/backoffice/staff/admin-2')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'STAFF' });
      expect(res.status).toBe(409);
      expect(res.body.type).toBe('LAST_ADMIN');
      expect(prisma.staff.update).not.toHaveBeenCalled();
    });

    it('no permite desactivar al último ADMIN activo (409 LAST_ADMIN)', async () => {
      prisma.staff.count.mockResolvedValue(0);
      const res = await request(app)
        .patch('/api/backoffice/staff/admin-2')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });
      expect(res.status).toBe(409);
      expect(res.body.type).toBe('LAST_ADMIN');
    });

    it('sí permite degradar a un ADMIN si queda otro ADMIN activo', async () => {
      prisma.staff.count.mockResolvedValue(1);
      const res = await request(app)
        .patch('/api/backoffice/staff/admin-2')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'STAFF' });
      expect(res.status).toBe(200);
      expect(prisma.staff.update).toHaveBeenCalled();
    });

    it('nadie puede desactivarse ni degradarse a sí mismo (403)', async () => {
      prisma.staff.count.mockResolvedValue(5);
      for (const body of [{ isActive: false }, { role: 'STAFF' }]) {
        const res = await request(app)
          .patch('/api/backoffice/staff/admin-1')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(body);
        expect(res.status).toBe(403);
        expect(res.body.type).toBe('SELF_ACTION_FORBIDDEN');
      }
      expect(prisma.staff.update).not.toHaveBeenCalled();
    });

    it('el reset de contraseña aplica la misma política (400 si es débil)', async () => {
      const res = await request(app)
        .patch('/api/backoffice/staff/staff-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'corta' });
      expect(res.status).toBe(400);
      expect(res.body.type).toBe('WEAK_PASSWORD');
    });

    it('el reset de contraseña válido guarda un hash, nunca la contraseña', async () => {
      const res = await request(app)
        .patch('/api/backoffice/staff/staff-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'nueva1234' });
      expect(res.status).toBe(200);
      const updateArgs = prisma.staff.update.mock.calls[0][0];
      expect(updateArgs.data.password).toBeUndefined();
      expect(updateArgs.data.passwordHash).toMatch(/^\$2[aby]\$/);
    });

    it('devuelve 404 si el usuario no existe', async () => {
      const res = await request(app)
        .patch('/api/backoffice/staff/no-existe')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Nuevo Nombre' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/backoffice/staff/:id', () => {
    it('no permite borrarse a uno mismo (403)', async () => {
      const res = await request(app)
        .delete('/api/backoffice/staff/admin-1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(403);
      expect(prisma.staff.delete).not.toHaveBeenCalled();
    });

    it('no permite borrar al último ADMIN activo (409 LAST_ADMIN)', async () => {
      prisma.staff.count.mockResolvedValue(0);
      const res = await request(app)
        .delete('/api/backoffice/staff/admin-2')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(409);
      expect(res.body.type).toBe('LAST_ADMIN');
      expect(prisma.staff.delete).not.toHaveBeenCalled();
    });

    it('borra a un STAFF normal (200)', async () => {
      const res = await request(app)
        .delete('/api/backoffice/staff/staff-1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(prisma.staff.delete).toHaveBeenCalledWith({ where: { id: 'staff-1' } });
    });
  });
});
