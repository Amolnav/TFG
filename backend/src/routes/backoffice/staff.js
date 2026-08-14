
const express = require('express');
const router = express.Router();
const staffController = require('../../controllers/backoffice/staffController');
const { requireRole } = require('../../middleware/authMiddleware');

// N2.1: la gestión del equipo es exclusiva de ADMIN
router.use(requireRole('ADMIN'));

// GET /api/backoffice/staff
router.get('/', staffController.listStaff);

// POST /api/backoffice/staff
router.post('/', staffController.createStaff);

// PATCH /api/backoffice/staff/:id
router.patch('/:id', staffController.updateStaff);

// DELETE /api/backoffice/staff/:id
router.delete('/:id', staffController.deleteStaff);

module.exports = router;
