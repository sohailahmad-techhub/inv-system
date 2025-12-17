const { body, query, param } = require('express-validator');

// Validation rules for recording a payment
const recordPaymentValidation = [
  body('invoiceId')
    .notEmpty().withMessage('Invoice ID is required')
    .isMongoId().withMessage('Invalid invoice ID'),
  body('amount')
    .notEmpty().withMessage('Amount is required')
    .isFloat({ min: 0.01 }).withMessage('Amount must be greater than zero'),
  body('method')
    .optional()
    .isIn(['Cash', 'BankTransfer', 'Card', 'Stripe', 'PayPal'])
    .withMessage('Invalid payment method'),
  body('reference')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Reference cannot exceed 100 characters'),
  body('date')
    .optional()
    .isISO8601().withMessage('Invalid date format'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
];

// Validation rules for getting payments
const getPaymentsValidation = [
  query('status')
    .optional()
    .isIn(['Pending', 'Completed', 'Failed', 'Refunded'])
    .withMessage('Invalid payment status'),
  query('method')
    .optional()
    .isIn(['Cash', 'BankTransfer', 'Card', 'Stripe', 'PayPal'])
    .withMessage('Invalid payment method'),
  query('invoiceId')
    .optional()
    .isMongoId().withMessage('Invalid invoice ID'),
  query('startDate')
    .optional()
    .isISO8601().withMessage('Invalid start date format'),
  query('endDate')
    .optional()
    .isISO8601().withMessage('Invalid end date format'),
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

// Validation rules for updating payment
const updatePaymentValidation = [
  param('id')
    .isMongoId().withMessage('Invalid payment ID'),
  body('status')
    .optional()
    .isIn(['Pending', 'Completed', 'Failed', 'Refunded'])
    .withMessage('Invalid payment status'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
];

// Validation rules for refund
const refundPaymentValidation = [
  param('id')
    .isMongoId().withMessage('Invalid payment ID'),
  body('amount')
    .optional()
    .isFloat({ min: 0.01 }).withMessage('Amount must be greater than zero'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Reason cannot exceed 500 characters')
];

// Validation rules for Stripe checkout
const stripeCheckoutValidation = [
  body('invoiceId')
    .notEmpty().withMessage('Invoice ID is required')
    .isMongoId().withMessage('Invalid invoice ID')
];

// Validation rules for PayPal order
const paypalOrderValidation = [
  body('invoiceId')
    .notEmpty().withMessage('Invoice ID is required')
    .isMongoId().withMessage('Invalid invoice ID')
];

// Validation rules for PayPal capture
const paypalCaptureValidation = [
  body('orderId')
    .notEmpty().withMessage('Order ID is required')
    .trim()
];

module.exports = {
  recordPaymentValidation,
  getPaymentsValidation,
  updatePaymentValidation,
  refundPaymentValidation,
  stripeCheckoutValidation,
  paypalOrderValidation,
  paypalCaptureValidation
};
