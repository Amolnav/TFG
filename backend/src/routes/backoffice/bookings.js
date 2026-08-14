
const express = require('express');
const router = express.Router();
const bookingController = require('../../controllers/backoffice/bookingController');

// GET /api/backoffice/bookings
// Lista todas las reservas con filtros
router.get('/', bookingController.getAllBookings);

// GET /api/backoffice/bookings/:id
// Obtiene detalles completos de una reserva
router.get('/:id', bookingController.getBookingById);

// N2.5: timeline de auditoría de la reserva
router.get('/:id/events', bookingController.getBookingEvents);

// POST /api/backoffice/bookings
// Crea nueva reserva (walk-ins, teléfono)
router.post('/', bookingController.createBooking);

// N2.2: walk-in — ocupar una mesa ahora mismo con datos mínimos
router.post('/walkin', bookingController.createWalkIn);

// PATCH /api/backoffice/bookings/:id
// Modifica una reserva existente
router.patch('/:id', bookingController.updateBooking);

// DELETE /api/backoffice/bookings/:id
// Cancela una reserva
router.delete('/:id', bookingController.deleteBooking);

// PATCH /api/backoffice/bookings/:id/status
// Cambio rápido de estado
router.patch('/:id/status', bookingController.updateBookingStatus);

// POST /api/backoffice/bookings/:id/reassign
// Reasignar a otra mesa (drag & drop)
router.post('/:id/reassign', bookingController.reassignTable);

module.exports = router;