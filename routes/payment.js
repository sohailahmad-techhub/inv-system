const express = require('express');
const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');

const router = express.Router();

const normalizeMethod = (method) => {
  const m = (method || '').toLowerCase();
  if (m === 'cash') return 'Cash';
  if (m === 'banktransfer' || m === 'bank_transfer' || m === 'bank') return 'BankTransfer';
  if (m === 'card' || m === 'creditcard' || m === 'credit_card') return 'Card';
  if (m === 'stripe') return 'Stripe';
  if (m === 'paypal') return 'PayPal';
  return 'Card';
};

// GET /pay/:invoiceId
router.get(
  '/:invoiceId',
  asyncHandler(async (req, res) => {
    const invoice = await Invoice.findById(req.params.invoiceId)
      .populate('clientId', 'firstName lastName email companyName')
      .populate('createdBy', 'firstName lastName email companyName');

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const amountToPay = Math.max(0, (invoice.totalAmount || 0) - (invoice.paidAmount || 0));

    res.json({
      success: true,
      data: {
        invoice,
        amountToPay,
        paymentMethods: ['Stripe', 'PayPal']
      }
    });
  })
);

// POST /pay/:invoiceId
router.post(
  '/:invoiceId',
  asyncHandler(async (req, res) => {
    const invoice = await Invoice.findById(req.params.invoiceId);

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const { amount, method, payerName, payerEmail, notes } = req.body;

    const parsedAmount = parseFloat(amount);
    const remainingBalance = (invoice.totalAmount || 0) - (invoice.paidAmount || 0);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    if (parsedAmount > remainingBalance) {
      return res.status(400).json({ success: false, message: 'Payment amount exceeds remaining balance' });
    }

    const normalizedMethod = normalizeMethod(method);

    const payment = await Payment.create({
      invoiceId: invoice._id,
      clientId: invoice.clientId,
      amount: parsedAmount,
      currency: invoice.currency,
      method: normalizedMethod,
      status: 'Completed',
      paymentDate: new Date(),
      reference: `PUBLIC-${Date.now()}`,
      notes: notes || `Public payment from ${payerName || payerEmail || 'Guest'}`,
      tenantId: invoice.tenantId
    });

    invoice.paidAmount = (invoice.paidAmount || 0) + parsedAmount;
    invoice.payments.push({ paymentId: payment._id, amount: parsedAmount, date: payment.paymentDate, method: normalizedMethod });
    await invoice.save();

    res.status(201).json({
      success: true,
      message: 'Payment completed',
      data: {
        paymentId: payment._id,
        invoiceId: invoice._id
      }
    });
  })
);

// GET /pay/confirmation/:paymentId
router.get(
  '/confirmation/:paymentId',
  asyncHandler(async (req, res) => {
    const payment = await Payment.findById(req.params.paymentId).populate(
      'invoiceId',
      'invoiceNumber currency totalAmount paidAmount paymentStatus'
    );

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    res.json({ success: true, data: payment });
  })
);

// GET /pay/receipt/:paymentId
router.get(
  '/receipt/:paymentId',
  asyncHandler(async (req, res) => {
    const payment = await Payment.findById(req.params.paymentId)
      .populate('invoiceId', 'invoiceNumber currency totalAmount')
      .populate('clientId', 'firstName lastName email companyName');

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    res.json({
      success: true,
      data: {
        receiptNumber: payment.paymentNumber,
        payment,
        invoice: payment.invoiceId,
        client: payment.clientId
      }
    });
  })
);

// GET /pay/verify/:paymentId
router.get(
  '/verify/:paymentId',
  asyncHandler(async (req, res) => {
    const { paymentId } = req.params;
    const { signature } = req.query;

    if (signature && process.env.PAYMENT_WEBHOOK_SECRET) {
      const expectedSignature = crypto
        .createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET)
        .update(paymentId)
        .digest('hex');

      if (signature !== expectedSignature) {
        return res.status(401).json({ success: false, message: 'Invalid signature' });
      }
    }

    const payment = await Payment.findById(paymentId).populate('invoiceId', 'invoiceNumber');
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    res.json({
      success: true,
      data: {
        paymentId: payment.paymentNumber,
        invoiceId: payment.invoiceId?._id,
        invoiceNumber: payment.invoiceId?.invoiceNumber,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        paymentDate: payment.paymentDate,
        method: payment.method,
        verified: true,
        verifiedAt: new Date()
      }
    });
  })
);

// POST /webhooks/payment-gateway
router.post(
  '/payment-gateway',
  asyncHandler(async (req, res) => {
    res.json({ success: true, message: 'Webhook processed' });
  })
);

module.exports = router;
