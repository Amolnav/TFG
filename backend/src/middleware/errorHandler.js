
const { logger, SENSITIVE_FIELDS } = require('../config/logger');
const { captureException } = require('../config/monitoring');
/**
 * Middleware de manejo de errores global
 * Captura todos los errores no controlados y devuelve respuestas JSON consistentes
 */

// BUG-06: el log de errores no debe volcar credenciales (los fallos de
// /api/auth/login dejaban la contraseña en claro en los logs).
// N4.3: la lista de campos sensibles es la misma que redacta el logger.
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body;
  const sanitized = { ...body };
  for (const field of SENSITIVE_FIELDS) {
    if (field in sanitized) sanitized[field] = '[REDACTED]';
  }
  return sanitized;
}

// Nota: Express identifica los middleware de error por su aridad (4 args)
const errorHandler = (err, req, res, _next) => {
  logger.error('❌ Error capturado:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    requestId: req.id,
    body: sanitizeBody(req.body)
  });

  // N4.3: los errores NO de negocio van a Sentry si está activo (no-op sin DSN)
  if (!['ValidationError', 'BusinessError'].includes(err.name)) {
    captureException(err);
  }

  // Violación del constraint de exclusión booking_no_table_overlap (23P01):
  // es la última defensa contra el doble-booking bajo concurrencia y debe
  // responder 409 amable, no un 500 DATABASE_ERROR (BUG-15/T2)
  if (err.message && err.message.includes('23P01')) {
    return res.status(409).json({
      status: 'error',
      type: 'TABLE_OCCUPIED',
      message: 'La mesa acaba de ser reservada por otra persona para ese horario. Prueba con otra hora.'
    });
  }

  // Errores de validación de Prisma
  if (err.code && err.code.startsWith('P')) {
    return handlePrismaError(err, res);
  }

  // Errores de validación personalizados
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      status: 'error',
      type: 'VALIDATION_ERROR',
      message: err.message,
      details: err.details || null
    });
  }

  // Errores de negocio personalizados
  if (err.name === 'BusinessError') {
    return res.status(err.statusCode || 400).json({
      status: 'error',
      type: err.type || 'BUSINESS_ERROR',
      message: err.message,
      details: err.details || null
    });
  }

  // Error por defecto
  res.status(err.statusCode || 500).json({
    status: 'error',
    type: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production' 
      ? 'Ha ocurrido un error interno del servidor' 
      : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * Maneja errores específicos de Prisma
 */
function handlePrismaError(err, res) {
  switch (err.code) {
    case 'P2002':
      // Violación de unique constraint
      return res.status(409).json({
        status: 'error',
        type: 'DUPLICATE_ENTRY',
        message: 'Ya existe un registro con estos datos.',
        field: err.meta?.target?.[0] || 'unknown'
      });
    
    case 'P2003':
      // Foreign key constraint failed
      return res.status(400).json({
        status: 'error',
        type: 'INVALID_REFERENCE',
        message: 'Referencia inválida a otro registro.',
        field: err.meta?.field_name || 'unknown'
      });
    
    case 'P2025':
      // Record not found
      return res.status(404).json({
        status: 'error',
        type: 'NOT_FOUND',
        message: 'El registro solicitado no existe.'
      });
    
    default:
      return res.status(500).json({
        status: 'error',
        type: 'DATABASE_ERROR',
        message: 'Error en la base de datos.',
        code: err.code
      });
  }
}

/**
 * Clase de error personalizado para errores de negocio
 */
class BusinessError extends Error {
  constructor(message, type = 'BUSINESS_ERROR', statusCode = 400, details = null) {
    super(message);
    this.name = 'BusinessError';
    this.type = type;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Clase de error personalizado para validaciones
 */
class ValidationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

/**
 * Wrapper para async controllers
 * Evita tener que escribir try/catch en cada controlador
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Middleware para rutas no encontradas
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    status: 'error',
    type: 'NOT_FOUND',
    message: `Ruta no encontrada: ${req.method} ${req.path}`
  });
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler,
  BusinessError,
  ValidationError
};