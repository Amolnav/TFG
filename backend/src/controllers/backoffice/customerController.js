
const customerService = require('../../services/customerService');
const { asyncHandler, BusinessError } = require('../../middleware/errorHandler');

/**
 * GET /api/backoffice/customers
 * Lista clientes con búsqueda
 * Query: search?, isVip?, isBlacklisted?, limit?
 */
exports.getAllCustomers = asyncHandler(async (req, res) => {
  const { search, isVip, isBlacklisted, limit = 50 } = req.query;

  const filters = {
    limit: parseInt(limit)
  };

  if (isVip !== undefined) filters.isVip = isVip === 'true';
  if (isBlacklisted !== undefined) filters.isBlacklisted = isBlacklisted === 'true';

  const customers = await customerService.searchCustomers(search || '', filters);

  res.json({
    status: 'success',
    data: { customers, total: customers.length }
  });
});

/**
 * GET /api/backoffice/customers/:id
 * Perfil completo de un cliente con historial y estadísticas
 */
exports.getCustomerById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const profile = await customerService.getCustomerProfile(id);

  res.json({
    status: 'success',
    data: profile
  });
});

/**
 * PATCH /api/backoffice/customers/:id
 * Actualizar preferencias, tags, notas del cliente
 */
exports.updateCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { preferences, tags, allergens, birthday } = req.body;

  const updateData = {};
  if (preferences !== undefined) updateData.preferences = preferences;
  if (tags !== undefined) updateData.tags = tags;
  if (allergens !== undefined) updateData.allergens = allergens;
  if (birthday !== undefined) updateData.birthday = birthday ? new Date(birthday) : null;

  const updated = await customerService.updateCustomerProfile(id, updateData);

  res.json({
    status: 'success',
    message: 'Cliente actualizado correctamente',
    data: updated
  });
});

/**
 * POST /api/backoffice/customers/:id/notes
 * Añadir nota del staff sobre un cliente
 */
exports.addNote = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;

  if (!note || note.trim().length === 0) {
    throw new BusinessError('La nota no puede estar vacía', 'EMPTY_NOTE', 400);
  }

  const createdBy = req.user?.name || 'Staff';
  const newNote = await customerService.addCustomerNote(id, note.trim(), createdBy);

  res.status(201).json({
    status: 'success',
    message: 'Nota añadida correctamente',
    data: newNote
  });
});

/**
 * POST /api/backoffice/customers/:id/blacklist
 * Toggle blacklist de un cliente
 * Body: { blacklist: true/false, reason?: string }
 */
exports.toggleBlacklist = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { blacklist = true, reason } = req.body;

  const result = await customerService.toggleBlacklist(id, reason, blacklist);

  res.json({
    status: 'success',
    message: result.message,
    data: result.customer
  });
});

/**
 * POST /api/backoffice/customers/:id/vip
 * Toggle VIP de un cliente
 * Body: { isVip: true/false }
 */
exports.toggleVip = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isVip = true } = req.body;

  const updated = await customerService.toggleVIP(id, isVip);

  res.json({
    status: 'success',
    message: isVip ? 'Cliente marcado como VIP' : 'Estado VIP eliminado',
    data: updated
  });
});

// ── N4.4: RGPD ─────────────────────────────────────────────────────────

const gdprService = require('../../services/gdprService');

/**
 * GET /api/backoffice/customers/:id/export
 * Exportación RGPD: perfil + reservas + notas + lista de espera (JSON).
 */
exports.exportCustomerData = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const data = await gdprService.exportCustomerData(id);
  if (!data) {
    throw new BusinessError('Cliente no encontrado', 'NOT_FOUND', 404);
  }

  res.setHeader('Content-Disposition', `attachment; filename="cliente-${id.slice(0, 8)}.json"`);
  res.json({ status: 'success', data });
});

/**
 * POST /api/backoffice/customers/:id/anonymize (solo ADMIN)
 * Sustituye la PII por placeholders conservando las filas (estadística
 * intacta, integridad intacta). Irreversible.
 */
exports.anonymizeCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updated = await gdprService.anonymizeCustomer(id, req.user?.name || req.user?.email || 'staff');
  if (!updated) {
    throw new BusinessError('Cliente no encontrado', 'NOT_FOUND', 404);
  }

  res.json({
    status: 'success',
    message: 'Cliente anonimizado correctamente.',
    data: { customer: updated }
  });
});

module.exports = exports;
