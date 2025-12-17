const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');
const {
  createOrder,
  captureOrder,
  handleWebhook,
  refundPayPalPayment
} = require('../controllers/paypalController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const {
  paypalOrderValidation,
  paypalCaptureValidation,
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

// Webhook endpoint (no authentication needed)
router.post('/webhook', handleWebhook);

// All other routes require authentication
router.use(authenticate);

// Create PayPal order
router.post(
  '/create-order',
  paypalOrderValidation,
  handleValidationErrors,
  createOrder
);

// Capture PayPal order
router.post(
  '/capture-order',
  paypalCaptureValidation,
  handleValidationErrors,
  captureOrder
);

// Refund payment (ADMIN, ACCOUNTANT only)
router.post(
  '/refund/:id',
  authorize('ADMIN', 'ACCOUNTANT'),
  refundPaymentValidation,
  handleValidationErrors,
  refundPayPalPayment
);

module.exports = router;
