const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');
const {
  getInvoicePaymentStatus,
  createInvoice,
  getInvoices,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  markOverdueInvoices
} = require('../controllers/invoiceController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const {
  createInvoiceValidation,
  getInvoicesValidation,
  updateInvoiceValidation
} = require('../middleware/invoiceValidation');

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

// Mark overdue invoices (ADMIN, ACCOUNTANT only)
router.post(
  '/mark-overdue',
  authorize('ADMIN', 'ACCOUNTANT'),
  markOverdueInvoices
);

// Create invoice (ADMIN, ACCOUNTANT only)
router.post(
  '/',
  authorize('ADMIN', 'ACCOUNTANT'),
  createInvoiceValidation,
  handleValidationErrors,
  createInvoice
);

// Get all invoices
router.get(
  '/',
  getInvoicesValidation,
  handleValidationErrors,
  getInvoices
);

// Get invoice payment status
router.get('/:id/payment-status', getInvoicePaymentStatus);

// Get invoice by ID
router.get('/:id', getInvoiceById);

// Update invoice (ADMIN, ACCOUNTANT only)
router.put(
  '/:id',
  authorize('ADMIN', 'ACCOUNTANT'),
  updateInvoiceValidation,
  handleValidationErrors,
  updateInvoice
);

// Delete invoice (ADMIN only)
router.delete(
  '/:id',
  authorize('ADMIN'),
  deleteInvoice
);

module.exports = router;
