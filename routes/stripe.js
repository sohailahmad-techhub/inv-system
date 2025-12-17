const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');
const {
  createCheckoutSession,
  handleWebhook,
  getPaymentStatus,
  refundStripePayment
} = require('../controllers/stripeController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const {
  stripeCheckoutValidation,
  refundPaymentValidation
} = require('../middleware/paymentValidation');

// Validation error handler middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Webhook endpoint (no authentication needed, Stripe will verify)
router.post('/webhook', handleWebhook);

// All other routes require authentication
router.use(authenticate);

// Create checkout session
router.post(
  '/checkout',
  stripeCheckoutValidation,
  handleValidationErrors,
  createCheckoutSession
);

// Get payment status
router.get('/payment/:id', getPaymentStatus);

// Refund payment (ADMIN, ACCOUNTANT only)
router.post(
  '/refund/:id',
  authorize('ADMIN', 'ACCOUNTANT'),
  refundPaymentValidation,
  handleValidationErrors,
  refundStripePayment
);

module.exports = router;
