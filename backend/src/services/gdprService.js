
const prisma = require('../config/database');
const configService = require('./configService');
const { logger } = require('../config/logger');

// N4.4: RGPD. El restaurante es responsable del tratamiento de la PII de sus
// comensales; el producto ofrece de serie:
//   - Exportación de los datos de un cliente (perfil + reservas).
//   - Anonimización: sustituye la PII por placeholders SIN borrar filas
//     (las reservas y la estadística se conservan; la integridad no se rompe).
//   - Retención automática: job diario que anonimiza clientes sin actividad
//     tras N meses (gdpr_retention_months; 0 = desactivado).

const ANON_TAG = 'ANONIMIZADO';
const ANON_DOMAIN = 'anonimo.local';

function isAnonymized(customer) {
  return customer.email.endsWith(`@${ANON_DOMAIN}`);
}

/**
 * Datos completos de un cliente para la exportación RGPD (derecho de acceso
 * y portabilidad).
 */
async function exportCustomerData(customerId) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      bookings: {
        orderBy: { date: 'desc' },
        include: { table: { include: { zone: true } } }
      },
      notes: { orderBy: { createdAt: 'desc' } },
      waitlist: { orderBy: { createdAt: 'desc' } }
    }
  });
  if (!customer) return null;

  return {
    exportedAt: new Date().toISOString(),
    customer: {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone,
      language: customer.language,
      allergens: customer.allergens,
      preferences: customer.preferences,
      birthday: customer.birthday,
      tags: customer.tags,
      isVip: customer.isVip,
      isBlacklisted: customer.isBlacklisted,
      blacklistReason: customer.blacklistReason,
      totalVisits: customer.totalVisits,
      totalNoShows: customer.totalNoShows,
      previousEmails: customer.previousEmails,
      previousPhones: customer.previousPhones,
      previousNames: customer.previousNames,
      createdAt: customer.createdAt
    },
    bookings: customer.bookings.map((booking) => ({
      id: booking.id,
      date: booking.date,
      pax: booking.pax,
      status: booking.status,
      source: booking.source,
      specialRequests: booking.specialRequests,
      table: booking.table ? `${booking.table.name}${booking.table.zone ? ` (${booking.table.zone.name})` : ''}` : null,
      createdAt: booking.createdAt
    })),
    notes: customer.notes.map((note) => ({ note: note.note, createdBy: note.createdBy, createdAt: note.createdAt })),
    waitlist: customer.waitlist.map((entry) => ({
      date: entry.date,
      pax: entry.pax,
      isResolved: entry.isResolved,
      createdAt: entry.createdAt
    }))
  };
}

/**
 * Anonimiza la PII de un cliente conservando todas sus filas.
 * @returns el cliente actualizado, o null si no existe.
 */
async function anonymizeCustomer(customerId, actor = 'sistema') {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return null;
  if (isAnonymized(customer)) return customer;

  const shortId = customerId.slice(0, 8);

  // Las notas de staff y las peticiones especiales son texto libre con PII
  await prisma.customerNote.deleteMany({ where: { customerId } });
  await prisma.booking.updateMany({
    where: { customerId },
    data: { specialRequests: null, confirmationToken: null, reconfirmToken: null }
  });

  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: {
      email: `anon-${shortId}@${ANON_DOMAIN}`,
      phone: '000000000',
      firstName: 'Cliente',
      lastName: `Anonimizado ${shortId}`,
      allergens: [],
      preferences: null,
      birthday: null,
      previousEmails: [],
      previousPhones: [],
      previousNames: [],
      tags: [...new Set([...(customer.tags || []).filter((tag) => tag === 'VIP' || tag === 'BLACKLIST'), ANON_TAG])]
    }
  });

  logger.info(`🕵️ Cliente anonimizado (RGPD): ${customerId} por ${actor}`);
  return updated;
}

/**
 * Job de retención: anonimiza clientes sin actividad reciente.
 * gdpr_retention_months = 0 desactiva el barrido.
 */
async function runGdprSweep(now = new Date()) {
  const months = parseInt(await configService.getConfigValue('gdpr_retention_months'), 10) || 0;
  if (months <= 0) return { anonymized: 0 };

  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);

  // Clientes con TODA su actividad anterior al corte (o sin reservas y
  // creados antes del corte), aún no anonimizados
  const candidates = await prisma.customer.findMany({
    where: {
      email: { not: { endsWith: `@${ANON_DOMAIN}` } },
      createdAt: { lt: cutoff },
      bookings: { none: { date: { gte: cutoff } } },
      waitlist: { none: { createdAt: { gte: cutoff } } }
    },
    select: { id: true }
  });

  let anonymized = 0;
  for (const candidate of candidates) {
    await anonymizeCustomer(candidate.id, 'retención automática');
    anonymized += 1;
  }

  if (anonymized > 0) {
    logger.info(`🕵️ Retención RGPD: ${anonymized} clientes anonimizados (> ${months} meses sin actividad)`);
  }
  return { anonymized };
}

module.exports = { exportCustomerData, anonymizeCustomer, runGdprSweep, ANON_TAG, ANON_DOMAIN };
