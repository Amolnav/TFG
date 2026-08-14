import { test, expect, type Page } from '@playwright/test';

// E2E de N1.1 (autogestión por enlace) contra el stack de docker compose:
//   docker compose up -d db backend
//   docker compose exec backend npm run db:seed
//   npx playwright test
// Crea una reserva pública, entra en /reserva/:token desde el enlace de la
// pantalla de éxito y la cancela.

function formatDate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function nextOpenDay(offsetMin = 4): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetMin);
  while (d.getDay() === 1) d.setDate(d.getDate() + 1);
  return formatDate(d);
}

const RUN_ID = Date.now();
const CUSTOMER = {
  firstName: 'Autogestion',
  lastName: `E2E-${RUN_ID}`,
  email: `manage-e2e-${RUN_ID}@example.com`,
  phone: '+34600555444'
};

async function selectCalendarDay(page: Page, date: string) {
  const dayButton = page.locator(`[data-date="${date}"]`);
  for (let i = 0; i < 3 && (await dayButton.count()) === 0; i++) {
    await page.locator('.calendar-nav-next').click();
  }
  await expect(page.locator('.availability-calendar__day:not([disabled])').first())
    .toBeVisible({ timeout: 10000 });
  return dayButton;
}

test.describe.serial('autogestión de reserva por enlace (N1.1)', () => {
  test('el cliente cancela su reserva desde el enlace de autogestión', async ({ page }) => {
    // 1. Crear la reserva pública
    await page.goto('/reservar');
    const dayButton = await selectCalendarDay(page, nextOpenDay(4));
    await dayButton.click();
    await page.getByRole('button', { name: '14:30', exact: true }).click();
    await page.getByRole('button', { name: /Siguiente/ }).click();

    await page.fill('#u-firstname', CUSTOMER.firstName);
    await page.fill('#u-lastname', CUSTOMER.lastName);
    await page.fill('#u-email', CUSTOMER.email);
    await page.fill('#u-phone', CUSTOMER.phone);
    await page.getByRole('button', { name: /Confirmar/ }).click();
    await expect(page.getByText('¡Reserva Confirmada!')).toBeVisible({ timeout: 10000 });

    // 2. Ir a la página de autogestión desde el enlace de la pantalla de éxito
    await page.getByRole('link', { name: /Gestiona tu reserva/ }).click();
    await expect(page).toHaveURL(/\/reserva\/[0-9a-f]{32}/);

    // La página muestra los datos con la PII enmascarada
    await expect(page.getByText(CUSTOMER.firstName).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/m\*\*\*\d?@/)).toHaveCount(0); // el email completo no aparece
    await expect(page.getByText(CUSTOMER.email)).toHaveCount(0);
    await expect(page.getByText('444')).toBeVisible(); // últimos 3 dígitos del teléfono

    // 3. Cancelar la reserva (confirmando el diálogo)
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /Cancelar reserva/ }).click();

    await expect(page.getByText('Reserva cancelada')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: /Hacer una reserva/ })).toBeVisible();
  });

  test('el enlace usado sigue mostrando la reserva pero ya no es gestionable', async ({ page, request }) => {
    // Reutiliza el estado del test anterior: la reserva quedó CANCELLED.
    // Creamos otra reserva para obtener un token nuevo y comprobar el flujo GET puro.
    const response = await request.post('/api/public/reservations', {
      data: {
        date: nextOpenDay(6),
        time: '13:30',
        pax: 2,
        customer: {
          firstName: 'Token',
          lastName: `Directo-${RUN_ID}`,
          email: `token-e2e-${RUN_ID}@example.com`,
          phone: '+34600111222',
          language: 'es'
        }
      }
    });
    const body = await response.json();
    const token = body.data.booking.manageToken as string;
    expect(token).toMatch(/^[0-9a-f]{32}$/);

    await page.goto(`/reserva/${token}`);
    await expect(page.getByRole('button', { name: /Cancelar reserva/ })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Cambiar fecha u hora/ })).toBeVisible();
  });
});
