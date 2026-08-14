
const express = require('express');
const router = express.Router();
const waitlistController = require('../../controllers/waitlistController');

// N1.4: gestión de la lista de espera desde el panel (STAFF+)

// GET /api/backoffice/waitlist
router.get('/', waitlistController.listWaitlist);

// PATCH /api/backoffice/waitlist/:id/resolve
router.patch('/:id/resolve', waitlistController.resolveWaitlistEntry);

// DELETE /api/backoffice/waitlist/:id
router.delete('/:id', waitlistController.deleteWaitlistEntry);

module.exports = router;
