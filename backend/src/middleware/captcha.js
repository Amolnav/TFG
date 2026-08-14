
const axios = require('axios');
const configService = require('../services/configService');
const { asyncHandler, BusinessError } = require('./errorHandler');
const { logger } = require('../config/logger');

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Llamada HTTP a la API de verificación de Turnstile. Exportada por separado
 * para poder espiarla en los tests sin tocar la red.
 */
async function turnstileRequest(secret, token, remoteip) {
  const { data } = await axios.post(
    TURNSTILE_VERIFY_URL,
    new URLSearchParams({ secret, response: token, remoteip }),
    { timeout: 5000 }
  );
  return data;
}

/**
 * N4.1: verificación de Cloudflare Turnstile en la creación pública de
 * reservas. Desactivado por defecto (captcha_enabled=false); se activa por
 * configuración sin tocar código. Si Turnstile no responde (caída/red), se
 * deja pasar la petición (fail-open): una caída de Cloudflare no debe impedir
 * reservar — el rate limiting sigue actuando como freno.
 */
const verifyCaptcha = asyncHandler(async (req, res, next) => {
  const { captcha_enabled, captcha_secret_key } = await configService.getConfigValues([
    'captcha_enabled',
    'captcha_secret_key'
  ]);

  if (captcha_enabled !== 'true') return next();

  if (!captcha_secret_key) {
    logger.warn('⚠️ captcha_enabled=true pero falta captcha_secret_key: se omite la verificación');
    return next();
  }

  const token = req.body?.captchaToken;
  if (!token || typeof token !== 'string') {
    throw new BusinessError(
      'Completa la verificación anti-robots para enviar la reserva.',
      'CAPTCHA_REQUIRED',
      400
    );
  }

  let result;
  try {
    // A través de module.exports para que los tests puedan espiarla
    result = await module.exports.turnstileRequest(captcha_secret_key, token, req.ip);
  } catch (error) {
    logger.warn('⚠️ Turnstile no disponible; se acepta la petición sin verificar:', error.message);
    return next();
  }

  if (!result || result.success !== true) {
    throw new BusinessError(
      'La verificación anti-robots ha fallado. Recarga la página e inténtalo de nuevo.',
      'CAPTCHA_INVALID',
      403
    );
  }

  next();
});

module.exports = { verifyCaptcha, turnstileRequest };
