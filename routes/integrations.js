const express = require('express');
const router = express.Router();
const {
  getIntegrations,
  getIntegrationStatus,
  connectQuickBooks,
  quickbooksCallback,
  connectXero,
  xeroCallback,
  disconnectIntegration,
  syncIntegration,
  manualSync
} = require('../controllers/integrationController');
const { auth } = require('../middleware/auth');

// All routes require authentication
router.use(auth);

// Integration management
router.route('/')
  .get(getIntegrations);

router.route('/status')
  .get(getIntegrationStatus);

router.route('/sync')
  .post(manualSync);

// QuickBooks integration
router.route('/quickbooks/connect')
  .post(connectQuickBooks);

router.route('/quickbooks/callback')
  .get(quickbooksCallback);

router.route('/quickbooks/:provider')
  .post(syncIntegration)
  .delete(disconnectIntegration);

// Xero integration
router.route('/xero/connect')
  .post(connectXero);

router.route('/xero/callback')
  .get(xeroCallback);

router.route('/xero/:provider')
  .post(syncIntegration)
  .delete(disconnectIntegration);

module.exports = router;