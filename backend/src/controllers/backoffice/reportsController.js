
const prisma = require('../../config/database');
const { asyncHandler, BusinessError } = require('../../middleware/errorHandler');
const { formatDate } = require('../../utils/dateHelpers');
const { BOOKING_STATUS } = require('../../config/constants');

// N2.4: métricas históricas para la pestaña Informes. Una sola query de
// reservas del rango + una de "primera reserva por cliente"; el resto se
// agrega en memoria (rango limitado a 366 días).

const MAX_RANGE_DAYS = 366;

/**
 * Agregación pura (exportada para tests): recibe las reservas del rango y el
 * mapa clienteId → fecha de su primera reserva histórica.
 */
function aggregateReport(rows, firstBookingByCustomer, rangeStart) {
  const totals = {
    bookings: 0,
    pax: 0,
    cancelled: 0,
    noShows: 0,
    completed: 0,
    noShowRate: 0
  };
  const byDayMap = new Map();
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, bookings: 0 }));
  const statusBreakdown = {};
  const byCustomer = new Map();

  for (const row of rows) {
    statusBreakdown[row.status] = (statusBreakdown[row.status] || 0) + 1;

    if (row.status === BOOKING_STATUS.CANCELLED) {
      totals.cancelled += 1;
      continue; // las canceladas no cuentan como actividad
    }

    totals.bookings += 1;
    totals.pax += row.pax;
    if (row.status === BOOKING_STATUS.NO_SHOW) totals.noShows += 1;
    if (row.status === BOOKING_STATUS.COMPLETED) totals.completed += 1;

    const day = formatDate(new Date(row.date));
    const dayEntry = byDayMap.get(day) || { date: day, bookings: 0, pax: 0 };
    dayEntry.bookings += 1;
    dayEntry.pax += row.pax;
    byDayMap.set(day, dayEntry);

    byHour[new Date(row.date).getHours()].bookings += 1;

    const customerEntry = byCustomer.get(row.customerId) || {
      id: row.customerId,
      name: row.customer ? `${row.customer.firstName} ${row.customer.lastName}` : '—',
      bookings: 0,
      pax: 0
    };
    customerEntry.bookings += 1;
    customerEntry.pax += row.pax;
    byCustomer.set(row.customerId, customerEntry);
  }

  const finished = totals.noShows + totals.completed;
  totals.noShowRate = finished > 0 ? Math.round((totals.noShows / finished) * 1000) / 10 : 0;

  // Nuevos vs recurrentes: un cliente es "nuevo" si su primera reserva
  // histórica cae dentro del rango consultado
  let newCustomers = 0;
  let returningCustomers = 0;
  for (const customerId of byCustomer.keys()) {
    const first = firstBookingByCustomer.get(customerId);
    if (first && first >= rangeStart) newCustomers += 1;
    else returningCustomers += 1;
  }

  const topCustomers = [...byCustomer.values()]
    .sort((a, b) => b.bookings - a.bookings || b.pax - a.pax)
    .slice(0, 10);

  return {
    totals,
    byDay: [...byDayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byHour: byHour.filter((h) => h.bookings > 0),
    statusBreakdown,
    customers: { new: newCustomers, returning: returningCustomers },
    topCustomers
  };
}

/**
 * GET /api/backoffice/reports?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
exports.getReport = asyncHandler(async (req, res) => {
  const { from, to } = req.query;

  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new BusinessError('Parámetros from y to requeridos (YYYY-MM-DD)', 'MISSING_FIELDS', 400);
  }

  const rangeStart = new Date(`${from}T00:00:00.000`);
  const rangeEnd = new Date(`${to}T23:59:59.999`);

  if (rangeEnd < rangeStart) {
    throw new BusinessError('El rango de fechas es inválido', 'INVALID_DATE_RANGE', 400);
  }
  if ((rangeEnd - rangeStart) / (24 * 3600 * 1000) > MAX_RANGE_DAYS) {
    throw new BusinessError('El rango máximo es de un año', 'INVALID_DATE_RANGE', 400);
  }

  const rows = await prisma.booking.findMany({
    where: { date: { gte: rangeStart, lte: rangeEnd } },
    select: {
      id: true,
      date: true,
      pax: true,
      status: true,
      customerId: true,
      customer: { select: { firstName: true, lastName: true } }
    }
  });

  // Primera reserva histórica de cada cliente del rango (para nuevos/recurrentes)
  const customerIds = [...new Set(rows.map((row) => row.customerId))];
  const firstBookings = customerIds.length
    ? await prisma.booking.groupBy({
        by: ['customerId'],
        where: { customerId: { in: customerIds } },
        _min: { date: true }
      })
    : [];
  const firstBookingByCustomer = new Map(
    firstBookings.map((row) => [row.customerId, row._min.date])
  );

  const report = aggregateReport(rows, firstBookingByCustomer, rangeStart);

  res.json({
    status: 'success',
    data: { range: { from, to }, ...report }
  });
});

exports.aggregateReport = aggregateReport;

module.exports = exports;
