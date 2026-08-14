
// Constantes ESTRUCTURALES del dominio (enums y formatos).
// Las reglas de negocio configurables por restaurante (duraciones,
// antelaciones, umbral de no-shows, pax mínimo...) viven en SystemConfig
// con caché en ./bookingRules (plan de modularidad M4).

module.exports = {
  // 📊 ESTADOS
  BOOKING_STATUS: {
    PENDING: 'PENDING',
    CONFIRMED: 'CONFIRMED',
    RECONFIRMED: 'RECONFIRMED',
    SEATED: 'SEATED',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
    NO_SHOW: 'NO_SHOW'
  },

  BOOKING_SOURCE: {
    WEB: 'WEB',
    PHONE: 'PHONE',
    WALK_IN: 'WALK_IN',
    BACKOFFICE: 'BACKOFFICE'
  },

  // 🔐 TOKENS
  TOKEN: {
    CONFIRMATION_LENGTH: 32,
    RECONFIRMATION_LENGTH: 32
  },

  // N3.3: los 14 alérgenos de declaración obligatoria en la UE
  // (Reglamento (UE) 1169/2011, Anexo II). Claves estables; el frontend traduce.
  EU_ALLERGENS: [
    'gluten',
    'crustaceos',
    'huevos',
    'pescado',
    'cacahuetes',
    'soja',
    'lacteos',
    'frutos_cascara',
    'apio',
    'mostaza',
    'sesamo',
    'sulfitos',
    'altramuces',
    'moluscos'
  ]
};
