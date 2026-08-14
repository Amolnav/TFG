
const jwt = require('jsonwebtoken');
const { BusinessError } = require('./errorHandler');
const { asyncHandler } = require('./errorHandler');
const { JWT_SECRET } = require('../config/auth');
const prisma = require('../config/database');

/**
 * Middleware de autenticación JWT.
 * Verifica el token en el header Authorization: Bearer <token>
 * BUG-03: además re-verifica en BD que la cuenta existe y sigue activa,
 * para que desactivar un usuario surta efecto inmediato (no a las 8 h).
 */
const authMiddleware = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new BusinessError(
      'Acceso no autorizado. Se requiere autenticación.',
      'UNAUTHORIZED',
      401
    );
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new BusinessError(
        'La sesión ha expirado. Por favor, inicia sesión de nuevo.',
        'TOKEN_EXPIRED',
        401
      );
    }
    throw new BusinessError(
      'Token de autenticación inválido.',
      'INVALID_TOKEN',
      401
    );
  }

  const staff = await prisma.staff.findUnique({ where: { id: decoded.id } });

  if (!staff) {
    throw new BusinessError(
      'Token de autenticación inválido.',
      'INVALID_TOKEN',
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

  // Datos frescos de BD (el rol puede haber cambiado desde que se firmó el token)
  req.user = {
    id: staff.id,
    email: staff.email,
    name: staff.name,
    role: staff.role
  };
  next();
});

/**
 * BUG-03: autorización por rol. Uso: router.patch('/', requireRole('ADMIN'), handler)
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new BusinessError(
      'No tienes permisos para realizar esta operación.',
      'FORBIDDEN',
      403
    ));
  }
  next();
};

module.exports = { authMiddleware, requireRole };
