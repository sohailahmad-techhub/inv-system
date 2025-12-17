const express = require('express');
const router = express.Router();
const {
  getInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  sendInvoice,
  markInvoicePaid,
  generateInvoicePDF,
  getPaymentPrediction,
  getFraudCheck,
  reviewFraudFlag,
  generateQRCode
} = require('../controllers/invoiceController');
const { auth } = require('../middleware/auth');

// All routes require authentication
router.use(auth);

// Invoice CRUD operations
router.route('/')
  .get(getInvoices)
  .post(createInvoice);

router.route('/:id')
  .get(getInvoice)
  .put(updateInvoice)
  .delete(deleteInvoice);

// Invoice actions
router.post('/:id/send', sendInvoice);
router.post('/:id/mark-paid', markInvoicePaid);
router.get('/:id/pdf', generateInvoicePDF);
router.get('/:id/qr-code', generateQRCode);

// AI and fraud detection features
router.get('/:id/payment-prediction', getPaymentPrediction);
router.get('/:id/fraud-check', getFraudCheck);
router.post('/:id/fraud-review', reviewFraudFlag);

module.exports = router;
