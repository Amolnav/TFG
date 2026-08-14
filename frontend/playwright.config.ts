import { defineConfig, devices } from '@playwright/test';

// Suite E2E (T4). Requiere el backend del stack de docker compose:
//   docker compose up -d db backend
//   docker compose exec backend npm run db:seed
// El frontend lo levanta Playwright (vite dev server con proxy a :4000).
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    locale: 'es-ES',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
