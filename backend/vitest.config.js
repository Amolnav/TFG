import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // La suite de integración (Prisma real) tiene su propia config:
    // vitest.integration.config.js
    exclude: ['**/node_modules/**', 'src/tests/integration/**'],
    setupFiles: ['./src/tests/setup.js'],
    env: {
      // La lógica de reservas interpreta horas en la TZ del proceso (ver docs/PLAN_BUGS_Y_TESTS.md BUG-04).
      // Se fija aquí para que la suite sea independiente de la TZ del host.
      TZ: 'Europe/Madrid',
    },
  },
});
