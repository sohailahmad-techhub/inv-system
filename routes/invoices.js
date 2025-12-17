const express = require('express');
const { validationResult } = require('express-validator');
const {
  getInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  getInvoicePaymentStatus,
  markOverdueInvoices,
  sendInvoice,
  markInvoicePaid,
  generateInvoicePDF,
  getPaymentPrediction,
  getFraudCheck,
  reviewFraudFlag,
  generateQRCode
} = require('../controllers/invoiceController');
const { auth } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const {
  createInvoiceValidation,
  getInvoicesValidation,
  updateInvoiceValidation
} = require('../middleware/invoiceValidation');

const router = express.Router();

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

router.use(auth);

router.get('/', getInvoicesValidation, handleValidationErrors, getInvoices);
router.post(
  '/',
  authorize('ADMIN', 'ACCOUNTANT'),
  createInvoiceValidation,
  handleValidationErrors,
  createInvoice
);

router.post('/mark-overdue', authorize('ADMIN', 'ACCOUNTANT'), markOverdueInvoices);

router.get('/:id/payment-status', getInvoicePaymentStatus);

router.get('/:id', getInvoice);
router.put(
  '/:id',
  authorize('ADMIN', 'ACCOUNTANT'),
  updateInvoiceValidation,
  handleValidationErrors,
  updateInvoice
);
router.delete('/:id', authorize('ADMIN', 'ACCOUNTANT'), deleteInvoice);

router.post('/:id/send', authorize('ADMIN', 'ACCOUNTANT'), sendInvoice);
router.post('/:id/mark-paid', authorize('ADMIN', 'ACCOUNTANT'), markInvoicePaid);
router.get('/:id/pdf', authorize('ADMIN', 'ACCOUNTANT'), generateInvoicePDF);
router.get('/:id/qr-code', authorize('ADMIN', 'ACCOUNTANT'), generateQRCode);

router.get('/:id/payment-prediction', authorize('ADMIN', 'ACCOUNTANT'), getPaymentPrediction);
router.get('/:id/fraud-check', authorize('ADMIN', 'ACCOUNTANT'), getFraudCheck);
router.post('/:id/fraud-review', authorize('ADMIN'), reviewFraudFlag);

module.exports = router;
