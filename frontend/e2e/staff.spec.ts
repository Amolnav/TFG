import { test, expect, type Page } from '@playwright/test';

// E2E de N2.1 (gestión de equipo) contra el stack de docker compose:
//   docker compose up -d db backend
//   docker compose exec backend npm run db:seed
//   npx playwright test
// Da de alta un usuario STAFF desde el panel y verifica que puede iniciar
// sesión (y que, al no ser ADMIN, no ve la sección Equipo).

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@mesonmarinero.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'admin1234';

const RUN_ID = Date.now();
const NEW_STAFF = {
  name: `Camarero E2E ${RUN_ID}`,
  email: `staff-e2e-${RUN_ID}@example.com`,
  password: 'e2epass1234'
};

async function login(page: Page, email: string, password: string) {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.fill('#login-email', email);
  await page.fill('#login-password', password);
  await page.getByRole('button', { name: /Iniciar/ }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 10000 });
}

test.describe.serial('gestión de equipo (N2.1)', () => {
  test('1. un ADMIN da de alta a un miembro nuevo del equipo', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await page.getByRole('link', { name: /Equipo/ }).click();
    await expect(page).toHaveURL(/\/admin\/equipo/);

    await page.getByRole('button', { name: /Nuevo miembro/ }).click();
    const modal = page.locator('.admin-modal');
    await modal.locator('input[name="email"]').fill(NEW_STAFF.email);
    await modal.locator('input[name="name"]').fill(NEW_STAFF.name);
    await modal.locator('select[name="role"]').selectOption('STAFF');
    await modal.locator('input[name="password"]').fill(NEW_STAFF.password);
    await modal.getByRole('button', { name: /Guardar/ }).click();

    // El nuevo miembro aparece en el listado
    await expect(page.getByText(NEW_STAFF.email)).toBeVisible({ timeout: 10000 });
  });

  test('2. el usuario recién creado puede iniciar sesión (y no ve Equipo)', async ({ page }) => {
    await login(page, NEW_STAFF.email, NEW_STAFF.password);

    // El dashboard carga para el STAFF nuevo
    await expect(page.getByRole('link', { name: /Reservas/ }).first()).toBeVisible();

    // La sección Equipo es solo ADMIN: un STAFF no la ve en el menú
    await expect(page.getByRole('link', { name: /Equipo/ })).toHaveCount(0);
  });
});
