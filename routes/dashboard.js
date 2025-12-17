const express = require('express');
const { body, query } = require('express-validator');
const {
  getDashboardSummary,
  getRevenueChart,
  getPendingInvoices,
  getOverdueInvoices,
  getRecentInvoices,
  getTopClients
} = require('../controllers/dashboardController');
const { auth } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { cacheEndpoint } = require('../utils/cache');

const router = express.Router();

router.use(auth);
router.use(authorize('ADMIN', 'ACCOUNTANT'));

// Dashboard summary (cached for 15 minutes)
router.get('/summary', cacheEndpoint('summary', 15), getDashboardSummary);

// Revenue chart data (cached for 15 minutes)
router.get('/revenue-chart', 
  cacheEndpoint('revenue-chart', 15),
  query('period').optional().isIn(['monthly', 'yearly']).withMessage('Period must be monthly or yearly'),
  query('year').optional().isInt({ min: 2020, max: 2030 }).withMessage('Year must be between 2020 and 2030'),
  getRevenueChart
);

// Pending invoices list (cached for 5 minutes)
router.get('/pending-invoices',
  cacheEndpoint('pending-invoices', 5),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  getPendingInvoices
);

// Overdue invoices list (cached for 5 minutes)
router.get('/overdue-invoices',
  cacheEndpoint('overdue-invoices', 5),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  getOverdueInvoices
);

// Recent invoices (cached for 2 minutes)
router.get('/recent-invoices',
  cacheEndpoint('recent-invoices', 2),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  getRecentInvoices
);

// Top clients by revenue (cached for 10 minutes)
router.get('/top-clients',
  cacheEndpoint('top-clients', 10),
  query('period').optional().isIn(['all', 'month', 'year']).withMessage('Period must be all, month, or year'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  getTopClients
);

module.exports = router;