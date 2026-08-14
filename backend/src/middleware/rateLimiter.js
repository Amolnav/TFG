
const { rateLimit } = require('express-rate-limit');
const configService = require('../services/configService');

// N4.1: rate limiting en memoria (una instancia por despliegue). Los límites
// se leen de SystemConfig en cada petición a través de la caché de 30 s del
// configService, así son editables desde el panel sin reiniciar.
//
// En NODE_ENV=test los limitadores solo actúan sobre peticiones que llevan la
// cabecera x-test-rate-limit: la suite ejercita cientos de peticiones desde la
// misma IP y no debe consumir cupo salvo en los tests dedicados.

function skipInTests(req) {
  return process.env.NODE_ENV === 'test' && req.get('x-test-rate-limit') !== 'on';
}

async function limitFromConfig(key, fallback) {
  try {
    const value = parseInt(await configService.getConfigValue(key), 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

function rateLimitedHandler(req, res) {
  res.status(429).json({
    status: 'error',
    type: 'RATE_LIMITED',
    message: 'Demasiadas peticiones. Inténtalo de nuevo en unos minutos.',
    details: null
  });
}

// API pública: N peticiones por minuto e IP (default 60)
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: () => limitFromConfig('rate_limit_public_per_minute', 60),
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  handler: rateLimitedHandler
});

// Login: N intentos FALLIDOS por 15 minutos e IP (default 10). Los logins
// correctos no consumen cupo: solo frena fuerza bruta, no al personal.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: () => limitFromConfig('rate_limit_login_per_15min', 10),
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  handler: rateLimitedHandler
});

module.exports = { publicLimiter, loginLimiter };
