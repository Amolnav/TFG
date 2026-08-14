
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/auth');
const { asyncHandler, BusinessError } = require('../middleware/errorHandler');
const { logger } = require('../config/logger');

/**
 * POST /api/auth/login
 * Autentica al personal del restaurante y devuelve un JWT.
 * Body: { email, password }
 */
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new BusinessError(
      'Email y contraseña son obligatorios.',
      'MISSING_CREDENTIALS',
      400
    );
  }

  // Buscar usuario en la base de datos
  const staff = await prisma.staff.findUnique({
    where: { email: email.toLowerCase().trim() }
  });

  if (!staff) {
    throw new BusinessError(
      'Credenciales incorrectas.',
      'INVALID_CREDENTIALS',
      401
    );
  }

  if (!staff.isActive) {
    throw new BusinessError(
      'Esta cuenta está desactivada. Contacta con el administrador.',
      'ACCOUNT_DISABLED',
      403
    );
  }

  // Verificar contraseña
  const isPasswordValid = await bcrypt.compare(password, staff.passwordHash);

  if (!isPasswordValid) {
    throw new BusinessError(
      'Credenciales incorrectas.',
      'INVALID_CREDENTIALS',
      401
    );
  }

  // Generar JWT
  const token = jwt.sign(
    {
      id: staff.id,
      email: staff.email,
      name: staff.name,
      role: staff.role
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  logger.info(`🔐 Login: ${staff.email} (${staff.role})`);

  res.json({
    status: 'success',
    message: `Bienvenido, ${staff.name}`,
    data: {
      token,
      user: {
        id: staff.id,
        email: staff.email,
        name: staff.name,
        role: staff.role
      }
    }
  });
});

/**
 * GET /api/auth/me
 * Devuelve los datos del usuario autenticado (requiere token válido)
 */
exports.getMe = asyncHandler(async (req, res) => {
  const staff = await prisma.staff.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true
    }
  });

  if (!staff) {
    throw new BusinessError('Usuario no encontrado.', 'NOT_FOUND', 404);
  }

  res.json({
    status: 'success',
    data: { user: staff }
  });
});

/**
 * POST /api/auth/logout
 * El token JWT se descarta en el cliente. El servidor no necesita hacer nada.
 */
exports.logout = asyncHandler(async (req, res) => {
  res.json({
    status: 'success',
    message: 'Sesión cerrada correctamente.'
  });
});

module.exports = exports;
