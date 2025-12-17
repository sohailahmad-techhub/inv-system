const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');
const {
  recordPayment,
  getPayments,
  getPaymentById,
  updatePayment,
  deletePayment,
  refundPayment,
  reconcilePayments
} = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const {
  recordPaymentValidation,
  getPaymentsValidation,
  updatePaymentValidation,
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

// All routes require authentication
router.use(authenticate);

// Payment reconciliation (ADMIN, ACCOUNTANT only)
router.get(
  '/reconcile',
  authorize('ADMIN', 'ACCOUNTANT'),
  reconcilePayments
);

// Record payment (manual entry - ADMIN, ACCOUNTANT only)
router.post(
  '/',
  authorize('ADMIN', 'ACCOUNTANT'),
  recordPaymentValidation,
  handleValidationErrors,
  recordPayment
);

// Get all payments with filters (ADMIN, ACCOUNTANT only)
router.get(
  '/',
  authorize('ADMIN', 'ACCOUNTANT'),
  getPaymentsValidation,
  handleValidationErrors,
  getPayments
);

// Get payment details
router.get('/:id', getPaymentById);

// Update payment status (ADMIN, ACCOUNTANT only)
router.put(
  '/:id',
  authorize('ADMIN', 'ACCOUNTANT'),
  updatePaymentValidation,
  handleValidationErrors,
  updatePayment
);

// Delete pending payment (ADMIN only)
router.delete(
  '/:id',
  authorize('ADMIN'),
  deletePayment
);

// Issue refund (ADMIN, ACCOUNTANT only)
router.post(
  '/:id/refund',
  authorize('ADMIN', 'ACCOUNTANT'),
  refundPaymentValidation,
  handleValidationErrors,
  refundPayment
);

module.exports = router;
