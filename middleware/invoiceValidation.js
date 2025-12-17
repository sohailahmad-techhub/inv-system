const { body, query, param } = require('express-validator');

// Validation rules for creating an invoice
const createInvoiceValidation = [
  body('invoiceNumber')
    .notEmpty().withMessage('Invoice number is required')
    .trim()
    .isLength({ min: 1, max: 50 }).withMessage('Invoice number must be between 1 and 50 characters'),
  body('clientId')
    .notEmpty().withMessage('Client ID is required')
    .isMongoId().withMessage('Invalid client ID'),
  body('issueDate')
    .optional()
    .isISO8601().withMessage('Invalid issue date format'),
  body('dueDate')
    .notEmpty().withMessage('Due date is required')
    .isISO8601().withMessage('Invalid due date format'),
  body('items')
    .isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.description')
    .notEmpty().withMessage('Item description is required')
    .trim()
    .isLength({ max: 200 }).withMessage('Item description cannot exceed 200 characters'),
  body('items.*.quantity')
    .notEmpty().withMessage('Item quantity is required')
    .isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('items.*.unitPrice')
    .notEmpty().withMessage('Item unit price is required')
    .isFloat({ min: 0 }).withMessage('Unit price cannot be negative'),
  body('items.*.amount')
    .notEmpty().withMessage('Item amount is required')
    .isFloat({ min: 0 }).withMessage('Amount cannot be negative'),
  body('subtotal')
    .notEmpty().withMessage('Subtotal is required')
    .isFloat({ min: 0 }).withMessage('Subtotal cannot be negative'),
  body('tax')
    .optional()
    .isFloat({ min: 0 }).withMessage('Tax cannot be negative'),
  body('taxRate')
    .optional()
    .isFloat({ min: 0, max: 100 }).withMessage('Tax rate must be between 0 and 100'),
  body('discount')
    .optional()
    .isFloat({ min: 0 }).withMessage('Discount cannot be negative'),
  body('totalAmount')
    .notEmpty().withMessage('Total amount is required')
    .isFloat({ min: 0 }).withMessage('Total amount cannot be negative'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Notes cannot exceed 1000 characters'),
  body('terms')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Terms cannot exceed 1000 characters'),
  body('currency')
    .optional()
    .trim()
    .isLength({ min: 3, max: 3 }).withMessage('Currency must be a 3-letter code')
    .toUpperCase()
];

// Validation rules for getting invoices
const getInvoicesValidation = [
  query('clientId')
    .optional()
    .isMongoId().withMessage('Invalid client ID'),
  query('paymentStatus')
    .optional()
    .isIn(['Unpaid', 'Paid', 'Partially Paid', 'Overdue'])
    .withMessage('Invalid payment status'),
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

// Validation rules for updating an invoice
const updateInvoiceValidation = [
  param('id')
    .isMongoId().withMessage('Invalid invoice ID'),
  body('dueDate')
    .optional()
    .isISO8601().withMessage('Invalid due date format'),
  body('items')
    .optional()
    .isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.description')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Item description cannot exceed 200 characters'),
  body('items.*.quantity')
    .optional()
    .isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('items.*.unitPrice')
    .optional()
    .isFloat({ min: 0 }).withMessage('Unit price cannot be negative'),
  body('items.*.amount')
    .optional()
    .isFloat({ min: 0 }).withMessage('Amount cannot be negative'),
  body('subtotal')
    .optional()
    .isFloat({ min: 0 }).withMessage('Subtotal cannot be negative'),
  body('tax')
    .optional()
    .isFloat({ min: 0 }).withMessage('Tax cannot be negative'),
  body('taxRate')
    .optional()
    .isFloat({ min: 0, max: 100 }).withMessage('Tax rate must be between 0 and 100'),
  body('discount')
    .optional()
    .isFloat({ min: 0 }).withMessage('Discount cannot be negative'),
  body('totalAmount')
    .optional()
    .isFloat({ min: 0 }).withMessage('Total amount cannot be negative'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Notes cannot exceed 1000 characters'),
  body('terms')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Terms cannot exceed 1000 characters')
];

module.exports = {
  createInvoiceValidation,
  getInvoicesValidation,
  updateInvoiceValidation
};
