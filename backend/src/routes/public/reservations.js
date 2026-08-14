
const express = require('express');
const router = express.Router();

// Importar controladores
const availabilityController = require('../../controllers/availabilityController');
const reservationController = require('../../controllers/reservationController');
const { verifyCaptcha } = require('../../middleware/captcha');

// --- RUTAS DE DISPONIBILIDAD ---

// GET /api/public/reservations/availability/config
// Obtener configuración pública
router.get('/availability/config', availabilityController.getPublicConfig);

// GET /api/public/reservations/availability/calendar
// Obtener días disponibles en un mes
router.get('/availability/calendar', availabilityController.getAvailableCalendar);

// POST /api/public/reservations/availability/times
// Obtener horas disponibles para un día
router.post('/availability/times', availabilityController.getAvailableTimes);

// POST /api/public/reservations/availability/check
// Comprobar disponibilidad en hora específica + sugerencias
router.post('/availability/check', availabilityController.checkAvailability);

// --- RUTAS DE RESERVAS ---

// POST /api/public/reservations
// Crear nueva reserva (N4.1: captcha Turnstile activable por configuración)
router.post('/', verifyCaptcha, reservationController.createReservation);

// --- N1.1: AUTOGESTIÓN POR ENLACE (sin login, token = capacidad de acceso) ---

// GET /api/public/reservations/manage/:token — ver la reserva (PII enmascarada)
router.get('/manage/:token', reservationController.getManagedBooking);

// POST /api/public/reservations/manage/:token/cancel — cancelar
router.post('/manage/:token/cancel', reservationController.cancelManagedBooking);

// POST /api/public/reservations/manage/:token/reschedule — cambiar fecha/hora
router.post('/manage/:token/reschedule', reservationController.rescheduleManagedBooking);

// N1.2: reconfirmación en un clic desde el email de recordatorio
router.post('/reconfirm/:token', reservationController.reconfirmBooking);

// N1.4: alta en la lista de espera cuando un día está completo
const waitlistController = require('../../controllers/waitlistController');
router.post('/waitlist', waitlistController.joinWaitlist);

module.exports = router;