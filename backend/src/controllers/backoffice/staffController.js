
const bcrypt = require('bcryptjs');
const prisma = require('../../config/database');
const { asyncHandler, BusinessError, ValidationError } = require('../../middleware/errorHandler');
const { validateEmail } = require('../../services/validationService');
const { logger } = require('../../config/logger');

// N2.1: gestión de personal desde el panel. Todas las rutas son solo ADMIN
// (requireRole en la ruta). Invariantes: nunca puede quedar el sistema sin un
// ADMIN activo, y nadie puede desactivar/degradar/borrar su propia cuenta.

const VALID_ROLES = ['ADMIN', 'STAFF'];

// Campos seguros: el passwordHash no sale jamás de la API
const SAFE_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true
};

/**
 * Política mínima de contraseñas: 8+ caracteres con al menos una letra y un
 * número. Lanza BusinessError WEAK_PASSWORD para que el frontend lo traduzca.
 */
function assertPasswordPolicy(password) {
  const ok = typeof password === 'string'
    && password.length >= 8
    && /[A-Za-z]/.test(password)
    && /\d/.test(password);
  if (!ok) {
    throw new BusinessError(
      'La contraseña debe tener al menos 8 caracteres e incluir letras y números.',
      'WEAK_PASSWORD',
      400
    );
  }
}

/**
 * Guarda del último ADMIN: comprueba que, excluyendo a `excludeId`, queda al
 * menos otro ADMIN activo en el sistema.
 */
async function assertNotLastActiveAdmin(excludeId) {
  const otherActiveAdmins = await prisma.staff.count({
    where: { role: 'ADMIN', isActive: true, NOT: { id: excludeId } }
  });
  if (otherActiveAdmins === 0) {
    throw new BusinessError(
      'No se puede dejar el sistema sin ningún administrador activo.',
      'LAST_ADMIN',
      409
    );
  }
}

/**
 * GET /api/backoffice/staff
 */
exports.listStaff = asyncHandler(async (req, res) => {
  const staff = await prisma.staff.findMany({
    select: SAFE_SELECT,
    orderBy: [{ createdAt: 'asc' }]
  });
  res.json({ status: 'success', data: { staff } });
});

/**
 * POST /api/backoffice/staff
 * Body: { email, name, password, role? }
 */
exports.createStaff = asyncHandler(async (req, res) => {
  const { email, name, password, role = 'STAFF' } = req.body;

  const normalizedEmail = typeof email === 'string' ? email.toLowerCase().trim() : email;
  const errors = [];
  try {
    validateEmail(normalizedEmail);
  } catch (e) {
    errors.push(e.message);
  }
  if (!name || String(name).trim().length < 2) {
    errors.push('El nombre debe tener al menos 2 caracteres');
  }
  if (!VALID_ROLES.includes(role)) {
    errors.push(`El rol debe ser uno de: ${VALID_ROLES.join(', ')}`);
  }
  if (errors.length > 0) {
    throw new ValidationError('Datos de usuario inválidos', errors);
  }
  assertPasswordPolicy(password);

  const passwordHash = await bcrypt.hash(password, 10);

  // El email duplicado lo detecta el unique de BD (P2002 → 409 DUPLICATE_ENTRY)
  const staff = await prisma.staff.create({
    data: {
      email: normalizedEmail,
      name: String(name).trim(),
      role,
      passwordHash
    },
    select: SAFE_SELECT
  });

  // Auditoría mínima de quién crea a quién (N4.3 lo llevará al logger estructurado)
  logger.info(`👥 Staff creado: ${staff.email} (${staff.role}) por ${req.user.email}`);

  res.status(201).json({ status: 'success', data: { staff } });
});

/**
 * PATCH /api/backoffice/staff/:id
 * Body: { name?, role?, isActive?, password? }
 */
exports.updateStaff = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, role, isActive, password } = req.body;

  const target = await prisma.staff.findUnique({ where: { id } });
  if (!target) {
    throw new BusinessError('Usuario no encontrado.', 'NOT_FOUND', 404);
  }

  const demoting = role !== undefined && role !== target.role && target.role === 'ADMIN';
  const deactivating = isActive === false && target.isActive;

  // Nadie se desactiva ni se degrada a sí mismo: lo debe hacer otro ADMIN
  if (target.id === req.user.id && (demoting || deactivating)) {
    throw new BusinessError(
      'No puedes desactivar o cambiar el rol de tu propia cuenta.',
      'SELF_ACTION_FORBIDDEN',
      403
    );
  }

  if (role !== undefined && !VALID_ROLES.includes(role)) {
    throw new ValidationError('Datos de usuario inválidos', [
      `El rol debe ser uno de: ${VALID_ROLES.join(', ')}`
    ]);
  }
  if (name !== undefined && String(name).trim().length < 2) {
    throw new ValidationError('Datos de usuario inválidos', [
      'El nombre debe tener al menos 2 caracteres'
    ]);
  }

  // Guarda del último ADMIN activo
  if (target.role === 'ADMIN' && target.isActive && (demoting || deactivating)) {
    await assertNotLastActiveAdmin(target.id);
  }

  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (role !== undefined) data.role = role;
  if (isActive !== undefined) data.isActive = Boolean(isActive);
  if (password !== undefined) {
    assertPasswordPolicy(password);
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  if (Object.keys(data).length === 0) {
    throw new ValidationError('Datos de usuario inválidos', [
      'No se ha indicado ningún campo que actualizar'
    ]);
  }

  const staff = await prisma.staff.update({
    where: { id },
    data,
    select: SAFE_SELECT
  });

  const changes = Object.keys(data).map((k) => (k === 'passwordHash' ? 'password' : k)).join(', ');
  logger.info(`👥 Staff actualizado (${changes}): ${target.email} por ${req.user.email}`);

  res.json({ status: 'success', data: { staff } });
});

/**
 * DELETE /api/backoffice/staff/:id
 */
exports.deleteStaff = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const target = await prisma.staff.findUnique({ where: { id } });
  if (!target) {
    throw new BusinessError('Usuario no encontrado.', 'NOT_FOUND', 404);
  }

  if (target.id === req.user.id) {
    throw new BusinessError(
      'No puedes borrar tu propia cuenta.',
      'SELF_ACTION_FORBIDDEN',
      403
    );
  }

  if (target.role === 'ADMIN' && target.isActive) {
    await assertNotLastActiveAdmin(target.id);
  }

  await prisma.staff.delete({ where: { id } });

  logger.info(`👥 Staff eliminado: ${target.email} por ${req.user.email}`);

  res.json({ status: 'success', message: 'Usuario eliminado correctamente.' });
});

module.exports = exports;
