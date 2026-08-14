// BUG-02: en producción el secreto JWT es obligatorio. Sin este check, el
// backend arrancaba firmando tokens con un secreto público conocido.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET es obligatorio en producción. Define la variable de entorno antes de arrancar el servidor.'
  );
}

const JWT_SECRET = process.env.JWT_SECRET || 'changeme-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

module.exports = {
  JWT_SECRET,
  JWT_EXPIRES_IN
};
