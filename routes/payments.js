const express = require('express');
const router = express.Router();
const {
  getPayments,
  getPayment,
  createPayment,
  updatePayment,
  deletePayment,
  processExternalPayment,
  getPaymentAnalytics,
  generatePaymentReceipt
} = require('../controllers/paymentController');
const { auth } = require('../middleware/auth');

// All routes require authentication
router.use(auth);

// Payment CRUD operations
router.route('/')
  .get(getPayments)
  .post(createPayment);

router.route('/:id')
  .get(getPayment)
  .put(updatePayment)
  .delete(deletePayment);

// Payment actions
router.post('/:id/process-external', processExternalPayment);
router.get('/:id/receipt', generatePaymentReceipt);

// Analytics
router.get('/analytics', getPaymentAnalytics);

module.exports = router;
