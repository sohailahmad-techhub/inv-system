const express = require('express');
const router = express.Router();
const {
  getWebhooks,
  getWebhook,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  getWebhookDeliveries,
  retryWebhookDelivery,
  getWebhookEvents
} = require('../controllers/webhookController');
const { auth } = require('../middleware/auth');

// All routes require authentication
router.use(auth);

// Webhook CRUD operations
router.route('/')
  .get(getWebhooks)
  .post(createWebhook);

router.route('/:id')
  .get(getWebhook)
  .put(updateWebhook)
  .delete(deleteWebhook);

// Webhook actions
router.post('/:id/test', testWebhook);
router.get('/:id/deliveries', getWebhookDeliveries);
router.post('/:id/deliveries/:deliveryId/retry', retryWebhookDelivery);

// Utilities
router.get('/events', getWebhookEvents);

module.exports = router;