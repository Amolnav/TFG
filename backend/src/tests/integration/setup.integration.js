// Setup de la suite de integración (T2): Prisma REAL contra la BD efímera
// de docker-compose.test.yml. Debe ejecutarse antes de que los módulos de la
// app importen config/database (que usa el singleton de global.prisma).

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://postgres:test@localhost:5434/resto_test';
process.env.NODE_ENV = 'test';

const { PrismaClient } = require('@prisma/client');

// Inyectar el cliente real en el singleton ANTES de que la app lo cargue
global.prisma = new PrismaClient();
