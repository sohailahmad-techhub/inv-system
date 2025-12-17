const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const QRCode = require('qrcode');
const crypto = require('crypto');

// @desc    Public payment page
// @route   GET /pay/:invoiceId
// @access  Public
const getPaymentPage = asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;
  
  const invoice = await Invoice.findById(invoiceId)
    .populate('clientId', 'firstName lastName email companyName')
    .populate('createdBy', 'firstName lastName email companyName');
  
  if (!invoice) {
    return res.status(404).json({
      success: false,
      message: 'Invoice not found'
    });
  }
  
  // Check if invoice is already paid
  if (invoice.status === 'paid') {
    return res.render('payment/already-paid', {
      invoice,
      message: 'This invoice has already been paid'
    });
  }
  
  // Generate QR code if not exists
  let qrCodeDataURL;
  try {
    qrCodeDataURL = await QRCode.toDataURL(invoice.qrCodeData, {
      width: 200,
      margin: 2
    });
  } catch (error) {
    console.error('QR Code generation failed:', error);
  }
  
  // Render payment page
  res.render('payment/index', {
    invoice,
    qrCodeDataURL,
    paymentPrediction: invoice.paymentPrediction,
    title: `Pay Invoice ${invoice.invoiceNumber}`
  });
});

// @desc    Process public payment
// @route   POST /pay/:invoiceId
// @access  Public
const processPublicPayment = asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;
  const { amount, method, payerName, payerEmail, notes } = req.body;
  
  const invoice = await Invoice.findById(invoiceId);
  
  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }
  
  // Check if invoice is already paid
  if (invoice.status === 'paid') {
    res.status(400);
    throw new Error('Invoice has already been paid');
  }
  
  // Validate payment amount
  const remainingBalance = invoice.total - invoice.totalPaid;
  if (amount > remainingBalance) {
    res.status(400);
    throw new Error('Payment amount exceeds remaining balance');
  }
  
  // Create payment record
  const payment = await Payment.create({
    invoiceId: invoice._id,
    clientId: invoice.clientId,
    amount: parseFloat(amount),
    method: method || 'other',
    status: 'completed', // For public payments, mark as completed
    paymentDate: new Date(),
    reference: `PAY-${Date.now()}`,
    notes: notes || `Payment from ${payerName || 'Guest'}`,
    tenantId: invoice.tenantId
  });
  
  // Update invoice
  const newTotalPaid = invoice.totalPaid + parseFloat(amount);
  invoice.payments.push({
    paymentId: payment._id,
    amount: parseFloat(amount),
    date: new Date(),
    method: method || 'other'
  });
  
  if (newTotalPaid >= invoice.total) {
    invoice.status = 'paid';
    invoice.paidDate = new Date();
  }
  
  await invoice.save();
  
  // Trigger webhook
  await triggerWebhook('payment.received', { 
    ...payment.toObject(), 
    invoice: invoice.toObject(),
    publicPayment: true 
  });
  
  if (invoice.status === 'paid') {
    await triggerWebhook('invoice.paid', invoice.toObject());
  }
  
  // Redirect to payment confirmation page
  res.redirect(`/pay/confirmation/${payment._id}`);
});

// @desc    Payment confirmation page
// @route   GET /pay/confirmation/:paymentId
// @access  Public
const getPaymentConfirmation = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  
  const payment = await Payment.findById(paymentId)
    .populate({
      path: 'invoiceId',
      populate: {
        path: 'clientId createdBy'
      }
    });
  
  if (!payment) {
    return res.status(404).json({
      success: false,
      message: 'Payment not found'
    });
  }
  
  res.render('payment/confirmation', {
    payment,
    invoice: payment.invoiceId,
    title: 'Payment Confirmation'
  });
});

// @desc    Get payment receipt
// @route   GET /pay/receipt/:paymentId
// @access  Public
const getPaymentReceipt = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  
  const payment = await Payment.findById(paymentId)
    .populate({
      path: 'invoiceId',
      populate: {
        path: 'clientId createdBy'
      }
    });
  
  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }
  
  // Generate receipt data
  const receipt = {
    receiptNumber: payment.paymentId,
    paymentId: payment.paymentId,
    amount: payment.amount,
    currency: payment.currency,
    method: payment.method,
    paymentDate: payment.paymentDate,
    invoice: {
      invoiceNumber: payment.invoiceId.invoiceNumber,
      total: payment.invoiceId.total
    },
    payee: {
      name: `${payment.invoiceId.clientId.firstName} ${payment.invoiceId.clientId.lastName}`,
      email: payment.invoiceId.clientId.email,
      companyName: payment.invoiceId.clientId.companyName
    },
    payer: {
      companyName: payment.invoiceId.createdBy.companyName,
      email: payment.invoiceId.createdBy.email
    },
    generatedAt: new Date()
  };
  
  res.json({
    success: true,
    data: receipt
  });
});

// @desc    Verify payment (for webhooks or integrations)
// @route   GET /pay/verify/:paymentId
// @access  Public
const verifyPayment = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  const { signature } = req.query;
  
  // Verify signature if provided
  if (signature) {
    const expectedSignature = crypto
      .createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET)
      .update(paymentId)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      return res.status(401).json({
        success: false,
        message: 'Invalid signature'
      });
    }
  }
  
  const payment = await Payment.findById(paymentId)
    .populate({
      path: 'invoiceId',
      select: 'invoiceNumber total status'
    });
  
  if (!payment) {
    return res.status(404).json({
      success: false,
      message: 'Payment not found'
    });
  }
  
  res.json({
    success: true,
    data: {
      paymentId: payment.paymentId,
      invoiceId: payment.invoiceId._id,
      invoiceNumber: payment.invoiceId.invoiceNumber,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      paymentDate: payment.paymentDate,
      method: payment.method,
      verified: true,
      verifiedAt: new Date()
    }
  });
});

// @desc    Webhook for payment gateway notifications
// @route   POST /webhooks/payment-gateway
// @access  Public
const paymentGatewayWebhook = asyncHandler(async (req, res) => {
  const { event, data } = req.body;
  
  try {
    switch (event) {
      case 'payment.completed':
        await handlePaymentCompleted(data);
        break;
      case 'payment.failed':
        await handlePaymentFailed(data);
        break;
      case 'payment.refunded':
        await handlePaymentRefunded(data);
        break;
      default:
        console.log(`Unhandled payment gateway event: ${event}`);
    }
    
    res.json({ success: true, message: 'Webhook processed' });
    
  } catch (error) {
    console.error('Payment gateway webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed'
    });
  }
});

// Helper functions for webhook handling

async function handlePaymentCompleted(data) {
  const { externalTransactionId, invoiceId, amount, status } = data;
  
  // Find existing payment or create new one
  let payment = await Payment.findOne({
    'externalData.transactionId': externalTransactionId
  });
  
  if (!payment) {
    // Create new payment record
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found for payment completion');
    }
    
    payment = await Payment.create({
      invoiceId: invoice._id,
      clientId: invoice.clientId,
      amount: parseFloat(amount),
      method: 'external',
      status: status === 'completed' ? 'completed' : 'pending',
      paymentDate: new Date(),
      externalData: {
        processor: data.processor || 'unknown',
        transactionId: externalTransactionId,
        rawResponse: data
      },
      tenantId: invoice.tenantId
    });
  } else {
    // Update existing payment
    payment.status = status === 'completed' ? 'completed' : 'pending';
    payment.externalData.rawResponse = data;
  }
  
  await payment.save();
  
  // Update invoice
  const invoice = await Invoice.findById(invoiceId);
  if (invoice && status === 'completed') {
    const existingPayment = invoice.payments.find(p => p.paymentId.toString() === payment._id.toString());
    if (!existingPayment) {
      invoice.payments.push({
        paymentId: payment._id,
        amount: parseFloat(amount),
        date: payment.paymentDate,
        method: 'external'
      });
    }
    
    const newTotalPaid = invoice.totalPaid + parseFloat(amount);
    if (newTotalPaid >= invoice.total) {
      invoice.status = 'paid';
      invoice.paidDate = payment.paymentDate;
    }
    
    await invoice.save();
  }
  
  // Trigger webhooks
  await triggerWebhook('payment.received', { ...payment.toObject(), invoice });
  if (invoice && invoice.status === 'paid') {
    await triggerWebhook('invoice.paid', invoice.toObject());
  }
}

async function handlePaymentFailed(data) {
  const { externalTransactionId } = data;
  
  const payment = await Payment.findOne({
    'externalData.transactionId': externalTransactionId
  });
  
  if (payment) {
    payment.status = 'failed';
    payment.externalData.rawResponse = data;
    await payment.save();
    
    await triggerWebhook('payment.failed', payment.toObject());
  }
}

async function handlePaymentRefunded(data) {
  const { externalTransactionId, refundAmount } = data;
  
  const payment = await Payment.findOne({
    'externalData.transactionId': externalTransactionId
  });
  
  if (payment) {
    payment.refunds.push({
      amount: parseFloat(refundAmount),
      reason: data.reason || 'Gateway refund',
      date: new Date(),
      refundId: data.externalRefundId
    });
    
    await payment.save();
    
    await triggerWebhook('payment.refunded', payment.toObject());
  }
}

// Helper function to trigger webhooks
async function triggerWebhook(event, data) {
  console.log(`Triggering webhook for event: ${event}`);
  // This would integrate with your webhook system
}

module.exports = {
  getPaymentPage,
  processPublicPayment,
  getPaymentConfirmation,
  getPaymentReceipt,
  verifyPayment,
  paymentGatewayWebhook
};