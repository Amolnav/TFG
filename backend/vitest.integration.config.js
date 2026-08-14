import { defineConfig } from 'vitest/config';

// Suite de integración (T2): corre contra un PostgreSQL real
// (docker compose -f ../docker-compose.test.yml up -d).
// Separada de la unitaria porque aquí NO se mockea Prisma.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/tests/integration/**/*.test.js'],
    setupFiles: ['./src/tests/integration/setup.integration.js'],
    env: {
      TZ: 'Europe/Madrid',
    },
    // Una única BD compartida: sin paralelismo entre ficheros
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
