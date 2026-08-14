
const pino = require('pino');

// N4.3: logging estructurado (JSON) con pino. Sustituye a los console.*
// dispersos. La redacción de campos sensibles reutiliza la misma lista que la
// sanitización del errorHandler (BUG-06).

const SENSITIVE_FIELDS = ['password', 'passwordHash', 'token', 'captchaToken'];

const level =
  process.env.LOG_LEVEL ||
  (process.env.NODE_ENV === 'test' ? 'silent' : 'info');

const baseLogger = pino({
  level,
  redact: {
    paths: [
      ...SENSITIVE_FIELDS,
      ...SENSITIVE_FIELDS.map((field) => `*.${field}`),
      ...SENSITIVE_FIELDS.map((field) => `*.*.${field}`),
      'req.headers.authorization'
    ],
    censor: '[REDACTED]'
  }
});

/**
 * Adaptador con firma tipo console: admite cadenas, objetos y Error en
 * cualquier posición. Las cadenas forman el mensaje; los objetos van como
 * campos estructurados y el Error como `err` (pino lo serializa con stack).
 */
function toPinoArgs(args) {
  const err = args.find((arg) => arg instanceof Error);
  const extras = args.filter(
    (arg) => arg !== null && typeof arg === 'object' && !(arg instanceof Error)
  );
  const msg = args
    .filter((arg) => arg === null || typeof arg !== 'object')
    .map(String)
    .join(' ');

  const fields = extras.length > 0 ? Object.assign({}, ...extras) : {};
  if (err) fields.err = err;
  return { fields, msg: msg || (err ? err.message : '') };
}

const logger = {
  debug: (...args) => { const { fields, msg } = toPinoArgs(args); baseLogger.debug(fields, msg); },
  info: (...args) => { const { fields, msg } = toPinoArgs(args); baseLogger.info(fields, msg); },
  warn: (...args) => { const { fields, msg } = toPinoArgs(args); baseLogger.warn(fields, msg); },
  error: (...args) => { const { fields, msg } = toPinoArgs(args); baseLogger.error(fields, msg); },
  /** Instancia pino subyacente (para pino-http y children) */
  pino: baseLogger
};

module.exports = { logger, SENSITIVE_FIELDS };
