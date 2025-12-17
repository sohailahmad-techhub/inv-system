const express = require('express');
const { validationResult } = require('express-validator');
const {
  getPayments,
  getPayment,
  createPayment,
  updatePayment,
  deletePayment,
  refundPayment,
  reconcilePayments,
  processExternalPayment,
  getPaymentAnalytics,
  generatePaymentReceipt
} = require('../controllers/paymentController');
const { auth } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const {
  recordPaymentValidation,
  getPaymentsValidation,
  updatePaymentValidation,
  refundPaymentValidation
} = require('../middleware/paymentValidation');

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

router.get('/', authorize('ADMIN', 'ACCOUNTANT'), getPaymentsValidation, handleValidationErrors, getPayments);
router.post(
  '/',
  authorize('ADMIN', 'ACCOUNTANT'),
  recordPaymentValidation,
  handleValidationErrors,
  createPayment
);

router.get('/reconcile', authorize('ADMIN', 'ACCOUNTANT'), reconcilePayments);
router.get('/analytics', authorize('ADMIN', 'ACCOUNTANT'), getPaymentAnalytics);

router.get('/:id', authorize('ADMIN', 'ACCOUNTANT'), getPayment);
router.put(
  '/:id',
  authorize('ADMIN', 'ACCOUNTANT'),
  updatePaymentValidation,
  handleValidationErrors,
  updatePayment
);
router.delete('/:id', authorize('ADMIN'), deletePayment);

router.post(
  '/:id/refund',
  authorize('ADMIN', 'ACCOUNTANT'),
  refundPaymentValidation,
  handleValidationErrors,
  refundPayment
);

router.post('/:id/process-external', authorize('ADMIN', 'ACCOUNTANT'), processExternalPayment);
router.get('/:id/receipt', authorize('ADMIN', 'ACCOUNTANT'), generatePaymentReceipt);

module.exports = router;
