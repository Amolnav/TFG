
const express = require('express');
const router = express.Router();
const reportsController = require('../../controllers/backoffice/reportsController');

// N2.4: métricas históricas (pestaña Informes, STAFF+)

// GET /api/backoffice/reports?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', reportsController.getReport);

module.exports = router;
