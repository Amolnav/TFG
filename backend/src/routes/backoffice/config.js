const express = require('express');
const router = express.Router();
const configController = require('../../controllers/backoffice/configController');
const { requireRole } = require('../../middleware/authMiddleware');

router.get('/', configController.getConfig);
// BUG-03: solo ADMIN puede cambiar la configuración
router.patch('/', requireRole('ADMIN'), configController.updateConfig);

module.exports = router;
