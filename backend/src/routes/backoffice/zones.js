
const express = require('express');
const router = express.Router();
const zoneController = require('../../controllers/backoffice/zoneController');
const { requireRole } = require('../../middleware/authMiddleware');

// GET /api/backoffice/zones
router.get('/', zoneController.getAllZones);

// POST /api/backoffice/zones
router.post('/', zoneController.createZone);

// PUT /api/backoffice/zones/:id
router.put('/:id', zoneController.updateZone);

// POST /api/backoffice/zones/:zoneId/tables
router.post('/:zoneId/tables', zoneController.createTable);

// PUT /api/backoffice/zones/tables/:tableId
router.put('/tables/:tableId', zoneController.updateTable);

// DELETE /api/backoffice/zones/tables/:tableId
// BUG-03: los borrados son solo ADMIN
router.delete('/tables/:tableId', requireRole('ADMIN'), zoneController.deleteTable);

// DELETE /api/backoffice/zones/:id
router.delete('/:id', requireRole('ADMIN'), zoneController.deleteZone);

module.exports = router;
