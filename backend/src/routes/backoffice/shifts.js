
const express = require('express');
const router = express.Router();
const shiftController = require('../../controllers/backoffice/shiftController');
const { requireRole } = require('../../middleware/authMiddleware');

// GET /api/backoffice/shifts
router.get('/', shiftController.getAllShifts);

// BUG-03 + M4: solo ADMIN puede crear, modificar o borrar turnos
// POST /api/backoffice/shifts
router.post('/', requireRole('ADMIN'), shiftController.createShift);

// PATCH /api/backoffice/shifts/:id
router.patch('/:id', requireRole('ADMIN'), shiftController.updateShift);

// DELETE /api/backoffice/shifts/:id
router.delete('/:id', requireRole('ADMIN'), shiftController.deleteShift);

module.exports = router;
