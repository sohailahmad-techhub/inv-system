const express = require('express');
const { body } = require('express-validator');
const {
  exportInvoicesPDF,
  exportInvoicesExcel,
  exportReportsPDF,
  exportFinancialStatement,
  exportTaxReport
} = require('../controllers/exportController');
const { auth } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

const router = express.Router();

router.use(auth);
router.use(authorize('ADMIN', 'ACCOUNTANT'));

// Export invoices as PDF
router.post('/invoices-pdf',
  body('filters').optional().isObject().withMessage('Filters must be an object'),
  body('filters.clientId').optional().isMongoId().withMessage('Valid client ID required'),
  body('filters.status').optional().isIn(['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED']).withMessage('Invalid status'),
  body('filters.startDate').optional().isISO8601().withMessage('Start date must be a valid ISO date'),
  body('filters.endDate').optional().isISO8601().withMessage('End date must be a valid ISO date'),
  exportInvoicesPDF
);

// Export invoices as Excel/CSV
router.post('/invoices-excel',
  body('filters').optional().isObject().withMessage('Filters must be an object'),
  body('filters.clientId').optional().isMongoId().withMessage('Valid client ID required'),
  body('filters.status').optional().isIn(['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED']).withMessage('Invalid status'),
  body('filters.startDate').optional().isISO8601().withMessage('Start date must be a valid ISO date'),
  body('filters.endDate').optional().isISO8601().withMessage('End date must be a valid ISO date'),
  exportInvoicesExcel
);

// Export reports as PDF
router.post('/reports-pdf',
  body('reportType').isIn(['financial-summary', 'client-analysis']).withMessage('Invalid report type'),
  body('filters').optional().isObject().withMessage('Filters must be an object'),
  exportReportsPDF
);

// Export financial statement
router.post('/financial-statement',
  body('startDate').isISO8601().withMessage('Start date is required and must be a valid ISO date'),
  body('endDate').isISO8601().withMessage('End date is required and must be a valid ISO date'),
  exportFinancialStatement
);

// Export tax report
router.post('/tax-report',
  body('year').isInt({ min: 2020, max: 2030 }).withMessage('Year is required and must be between 2020 and 2030'),
  body('region').optional().isString().withMessage('Region must be a string'),
  exportTaxReport
);

module.exports = router;