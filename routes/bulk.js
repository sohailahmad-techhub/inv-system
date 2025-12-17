const express = require('express');
const router = express.Router();
const {
  bulkGenerateInvoices,
  downloadBulkInvoicePDFs,
  getBulkInvoiceStatus,
  getBulkInvoiceTemplate
} = require('../controllers/bulkController');
const { auth } = require('../middleware/auth');

// All routes require authentication
router.use(auth);

// Bulk operations
router.post('/bulk', bulkGenerateInvoices);
router.get('/bulk/template', getBulkInvoiceTemplate);
router.get('/bulk/:batchId/status', getBulkInvoiceStatus);
router.get('/bulk/:batchId/download', downloadBulkInvoicePDFs);

module.exports = router;