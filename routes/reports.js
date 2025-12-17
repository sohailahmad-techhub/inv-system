const express = require('express');
const router = express.Router();
const {
  getTaxFilingReport,
  getTaxSummary,
  getTaxFilingForm,
  markTaxObligationFiled
} = require('../controllers/taxController');
const { auth } = require('../middleware/auth');

// All routes require authentication
router.use(auth);

// Tax reporting routes
router.get('/tax-filing/:region', getTaxFilingReport);
router.get('/tax-filing/:region/:form', getTaxFilingForm);
router.get('/tax-filing/:region/:obligationId/filed', markTaxObligationFiled);
router.get('/tax-summary', getTaxSummary);

module.exports = router;