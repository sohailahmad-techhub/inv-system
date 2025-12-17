const express = require('express');
const { query, param } = require('express-validator');
const {
  getClientAnalytics,
  getInvoiceAnalytics,
  getPaymentAnalytics
} = require('../controllers/analyticsController');
const { auth } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { cacheEndpoint } = require('../utils/cache');

const router = express.Router();

router.use(auth);
router.use(authorize('ADMIN', 'ACCOUNTANT'));

// Client analytics (cached for 10 minutes)
router.get('/clients/:id',
  cacheEndpoint('client-analytics', 10),
  param('id').isMongoId().withMessage('Valid client ID is required'),
  query('startDate').optional().isISO8601().withMessage('Start date must be a valid ISO date'),
  query('endDate').optional().isISO8601().withMessage('End date must be a valid ISO date'),
  getClientAnalytics
);

// Invoice analytics (cached for 10 minutes)
router.get('/invoices',
  cacheEndpoint('invoice-analytics', 10),
  query('startDate').optional().isISO8601().withMessage('Start date must be a valid ISO date'),
  query('endDate').optional().isISO8601().withMessage('End date must be a valid ISO date'),
  query('status').optional().isIn(['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED']).withMessage('Invalid status'),
  query('month').optional().isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
  query('year').optional().isInt({ min: 2020, max: 2030 }).withMessage('Year must be between 2020 and 2030'),
  getInvoiceAnalytics
);

// Payment analytics (cached for 10 minutes)
router.get('/payments',
  cacheEndpoint('payment-analytics', 10),
  query('startDate').optional().isISO8601().withMessage('Start date must be a valid ISO date'),
  query('endDate').optional().isISO8601().withMessage('End date must be a valid ISO date'),
  query('paymentMethod').optional().isIn(['CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'CHECK', 'PAYPAL', 'STRIPE', 'OTHER']).withMessage('Invalid payment method'),
  getPaymentAnalytics
);

module.exports = router;