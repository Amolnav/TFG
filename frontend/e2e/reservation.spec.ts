import { test, expect, type Page } from '@playwright/test';

// Suite E2E (T4) contra el stack de docker compose:
//   docker compose up -d db backend
//   docker compose exec backend npm run db:seed
//   npx playwright test
// Corre contra el seed DEMO del dataset por defecto (meson-marinero): turnos
// Comidas (13:30-17:00) y Cenas (20:30-23:30) con lunes cerrado. Para otro
// dataset, ajusta las credenciales/fechas con las variables E2E_*.

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@mesonmarinero.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'admin1234';

function formatDate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Próximo día ABIERTO (no lunes) a partir de +offsetMin días. */
function nextOpenDay(offsetMin = 3): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetMin);
  while (d.getDay() === 1) d.setDate(d.getDate() + 1);
  return formatDate(d);
}

/** Próximo LUNES (día cerrado) dentro de la ventana de reserva. */
function nextMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return formatDate(d);
}

const RUN_ID = Date.now();
const CUSTOMER = {
  firstName: 'Playwright',
  lastName: `E2E-${RUN_ID}`,
  email: `e2e-${RUN_ID}@example.com`,
  phone: '+34600123123'
};

/**
 * N3.1: el wizard usa un calendario con disponibilidad real en lugar de un
 * input de fecha. Navega de mes si hace falta y pulsa el día pedido.
 */
async function selectCalendarDay(page: Page, date: string) {
  const dayButton = page.locator(`[data-date="${date}"]`);
  for (let i = 0; i < 3 && (await dayButton.count()) === 0; i++) {
    await page.locator('.calendar-nav-next').click();
  }
  // Esperar a que el mes haya cargado (algún día habilitado visible)
  await expect(page.locator('.availability-calendar__day:not([disabled])').first())
    .toBeVisible({ timeout: 10000 });
  return dayButton;
}

async function createPublicReservation(page: Page, date: string, time: string) {
  await page.goto('/reservar');
  const dayButton = await selectCalendarDay(page, date);
  await dayButton.click();
  await page.getByRole('button', { name: time, exact: true }).click();
  await page.getByRole('button', { name: /Siguiente/ }).click();

  await page.fill('#u-firstname', CUSTOMER.firstName);
  await page.fill('#u-lastname', CUSTOMER.lastName);
  await page.fill('#u-email', CUSTOMER.email);
  await page.fill('#u-phone', CUSTOMER.phone);
  await page.getByRole('button', { name: /Confirmar/ }).click();

  await expect(page.getByText('¡Reserva Confirmada!')).toBeVisible({ timeout: 10000 });
}

async function adminLogin(page: Page) {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.fill('#login-email', ADMIN_EMAIL);
  await page.fill('#login-password', ADMIN_PASSWORD);
  await page.getByRole('button', { name: /Iniciar/ }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 10000 });
}

test.describe.serial('flujo de reservas end-to-end', () => {
  const bookingDate = nextOpenDay(3);

  test('1. reserva pública completa desde /reservar hasta la confirmación', async ({ page }) => {
    await createPublicReservation(page, bookingDate, '14:00');
    await expect(page.locator('.success-details-card')).toContainText('14:00');
  });

  test('2. login de admin y la reserva aparece en el listado', async ({ page }) => {
    await adminLogin(page);

    await page.getByRole('link', { name: /Reservas/ }).first().click();
    await expect(page).toHaveURL(/\/admin\/reservas/);

    // Filtrar por la fecha de la reserva creada en el test 1
    await page.locator('input[type="date"]').first().fill(bookingDate);
    await expect(page.getByText(CUSTOMER.firstName).first()).toBeVisible({ timeout: 10000 });
  });

  test('3. tiempo real: una reserva nueva notifica al panel abierto en otra pestaña', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminLogin(adminPage);

    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await createPublicReservation(publicPage, nextOpenDay(5), '20:30');

    // El dashboard del admin recibe el evento socket y muestra la notificación
    await expect(adminPage.getByText(/Nueva reserva de Playwright/)).toBeVisible({ timeout: 15000 });

    await adminContext.close();
    await publicContext.close();
  });

  test('4. un día cerrado (lunes) aparece deshabilitado en el calendario', async ({ page }) => {
    await page.goto('/reservar');
    const monday = nextMonday();
    const dayButton = await selectCalendarDay(page, monday);
    // N3.1: el día cerrado no se puede seleccionar
    await expect(dayButton).toBeDisabled();
    await expect(page.getByRole('button', { name: '14:00', exact: true })).toHaveCount(0);
  });
});
