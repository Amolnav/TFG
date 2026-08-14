
const express = require('express');
const router = express.Router();
const customerController = require('../../controllers/backoffice/customerController');
const { requireRole } = require('../../middleware/authMiddleware');

// GET /api/backoffice/customers
router.get('/', customerController.getAllCustomers);

// GET /api/backoffice/customers/:id
router.get('/:id', customerController.getCustomerById);

// PATCH /api/backoffice/customers/:id
router.patch('/:id', customerController.updateCustomer);

// POST /api/backoffice/customers/:id/notes
router.post('/:id/notes', customerController.addNote);

// POST /api/backoffice/customers/:id/blacklist
// BUG-03: blacklist y VIP son solo ADMIN
router.post('/:id/blacklist', requireRole('ADMIN'), customerController.toggleBlacklist);

// POST /api/backoffice/customers/:id/vip
router.post('/:id/vip', requireRole('ADMIN'), customerController.toggleVip);

// N4.4: RGPD — exportación (STAFF+, misma visibilidad que la ficha) y
// anonimización (solo ADMIN, irreversible)
router.get('/:id/export', customerController.exportCustomerData);
router.post('/:id/anonymize', requireRole('ADMIN'), customerController.anonymizeCustomer);

module.exports = router;