const asyncHandler = require('express-async-handler');
const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');

// @desc    Record a payment (manual entry - cash/bank transfer)
// @route   POST /payments
// @access  Private (ADMIN, ACCOUNTANT)
const recordPayment = asyncHandler(async (req, res) => {
  const { invoiceId, amount, method, reference, date, notes } = req.body;

  // Verify invoice exists
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }

  // Check if payment amount is valid
  if (amount <= 0) {
    res.status(400);
    throw new Error('Payment amount must be greater than zero');
  }

  // Check if payment amount exceeds remaining balance
  const remainingBalance = invoice.totalAmount - invoice.paidAmount;
  if (amount > remainingBalance) {
    res.status(400);
    throw new Error(`Payment amount exceeds remaining balance of ${remainingBalance}`);
  }

  // Create payment record
  const payment = await Payment.create({
    invoiceId,
    amount,
    method: method || 'Cash',
    status: 'Completed',
    date: date || Date.now(),
    reference,
    notes,
    processedBy: req.user._id
  });

  // Update invoice paid amount
  invoice.paidAmount += amount;
  await invoice.save();

  const populatedPayment = await Payment.findById(payment._id)
    .populate('invoiceId', 'invoiceNumber totalAmount paidAmount paymentStatus')
    .populate('processedBy', 'firstName lastName email');

  res.status(201).json({
    success: true,
    message: 'Payment recorded successfully',
    data: populatedPayment
  });
});

// @desc    Get all payments with filters
// @route   GET /payments
// @access  Private (ADMIN, ACCOUNTANT)
const getPayments = asyncHandler(async (req, res) => {
  const { 
    status, 
    method, 
    invoiceId, 
    startDate, 
    endDate,
    page = 1,
    limit = 10
  } = req.query;

  // Build filter object
  const filter = {};
  
  if (status) filter.status = status;
  if (method) filter.method = method;
  if (invoiceId) filter.invoiceId = invoiceId;
  
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = new Date(startDate);
    if (endDate) filter.date.$lte = new Date(endDate);
  }

  // Calculate pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  // Get total count for pagination
  const total = await Payment.countDocuments(filter);
  
  // Get payments
  const payments = await Payment.find(filter)
    .populate('invoiceId', 'invoiceNumber totalAmount paidAmount paymentStatus clientId')
    .populate('processedBy', 'firstName lastName email')
    .sort({ date: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  res.json({
    success: true,
    data: payments,
    pagination: {
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      limit: parseInt(limit)
    }
  });
});

// @desc    Get payment details
// @route   GET /payments/:id
// @access  Private
const getPaymentById = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id)
    .populate('invoiceId', 'invoiceNumber totalAmount paidAmount paymentStatus clientId')
    .populate('processedBy', 'firstName lastName email');

  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }

  // Check authorization - clients can only see their own payments
  if (req.user.role === 'CLIENT') {
    const invoice = await Invoice.findById(payment.invoiceId);
    if (invoice.clientId.toString() !== req.user._id.toString()) {
      res.status(403);
      throw new Error('Not authorized to view this payment');
    }
  }

  res.json({
    success: true,
    data: payment
  });
});

// @desc    Update payment status
// @route   PUT /payments/:id
// @access  Private (ADMIN, ACCOUNTANT)
const updatePayment = asyncHandler(async (req, res) => {
  const { status, notes } = req.body;

  const payment = await Payment.findById(req.params.id);

  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }

  // Only allow updating if payment is not already completed
  if (payment.status === 'Completed' && status !== 'Refunded') {
    res.status(400);
    throw new Error('Cannot update a completed payment');
  }

  const oldStatus = payment.status;
  const oldAmount = payment.amount;

  // Update payment
  payment.status = status || payment.status;
  payment.notes = notes || payment.notes;
  
  await payment.save();

  // Update invoice if payment status changed
  if (oldStatus !== payment.status) {
    const invoice = await Invoice.findById(payment.invoiceId);
    
    if (payment.status === 'Completed' && oldStatus === 'Pending') {
      invoice.paidAmount += oldAmount;
    } else if (payment.status === 'Failed' && oldStatus === 'Pending') {
      // No change to invoice
    } else if (payment.status === 'Refunded' && oldStatus === 'Completed') {
      invoice.paidAmount -= oldAmount;
      payment.refundedAmount = oldAmount;
      payment.refundedAt = Date.now();
    }
    
    await invoice.save();
  }

  const updatedPayment = await Payment.findById(payment._id)
    .populate('invoiceId', 'invoiceNumber totalAmount paidAmount paymentStatus')
    .populate('processedBy', 'firstName lastName email');

  res.json({
    success: true,
    message: 'Payment updated successfully',
    data: updatedPayment
  });
});

// @desc    Delete pending payment
// @route   DELETE /payments/:id
// @access  Private (ADMIN)
const deletePayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id);

  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }

  // Only allow deleting pending payments
  if (payment.status !== 'Pending') {
    res.status(400);
    throw new Error('Can only delete pending payments');
  }

  await payment.deleteOne();

  res.json({
    success: true,
    message: 'Payment deleted successfully'
  });
});

// @desc    Issue a refund
// @route   POST /payments/:id/refund
// @access  Private (ADMIN, ACCOUNTANT)
const refundPayment = asyncHandler(async (req, res) => {
  const { amount, reason } = req.body;

  const payment = await Payment.findById(req.params.id);

  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }

  // Check if payment is completed
  if (payment.status !== 'Completed') {
    res.status(400);
    throw new Error('Can only refund completed payments');
  }

  // Check if already refunded
  if (payment.status === 'Refunded') {
    res.status(400);
    throw new Error('Payment has already been refunded');
  }

  // Validate refund amount
  const refundAmount = amount || payment.amount;
  if (refundAmount > payment.amount) {
    res.status(400);
    throw new Error('Refund amount cannot exceed payment amount');
  }

  // Update payment status
  payment.status = 'Refunded';
  payment.refundedAmount = refundAmount;
  payment.refundedAt = Date.now();
  payment.notes = payment.notes 
    ? `${payment.notes}\nRefund reason: ${reason || 'Not specified'}`
    : `Refund reason: ${reason || 'Not specified'}`;
  
  await payment.save();

  // Update invoice paid amount
  const invoice = await Invoice.findById(payment.invoiceId);
  invoice.paidAmount -= refundAmount;
  await invoice.save();

  const updatedPayment = await Payment.findById(payment._id)
    .populate('invoiceId', 'invoiceNumber totalAmount paidAmount paymentStatus')
    .populate('processedBy', 'firstName lastName email');

  res.json({
    success: true,
    message: 'Payment refunded successfully',
    data: updatedPayment
  });
});

// @desc    Get payment reconciliation report
// @route   GET /payments/reconcile
// @access  Private (ADMIN, ACCOUNTANT)
const reconcilePayments = asyncHandler(async (req, res) => {
  // Get all invoices
  const invoices = await Invoice.find().populate('clientId', 'firstName lastName email');
  
  const discrepancies = [];

  for (const invoice of invoices) {
    // Get all completed payments for this invoice
    const payments = await Payment.find({ 
      invoiceId: invoice._id,
      status: 'Completed'
    });

    const calculatedPaidAmount = payments.reduce((sum, p) => sum + p.amount, 0);

    // Check for discrepancies
    if (Math.abs(calculatedPaidAmount - invoice.paidAmount) > 0.01) {
      discrepancies.push({
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        client: invoice.clientId,
        totalAmount: invoice.totalAmount,
        recordedPaidAmount: invoice.paidAmount,
        calculatedPaidAmount,
        difference: invoice.paidAmount - calculatedPaidAmount,
        paymentsCount: payments.length
      });
    }
  }

  res.json({
    success: true,
    message: `Found ${discrepancies.length} discrepancies`,
    data: {
      totalInvoices: invoices.length,
      discrepancies
    }
  });
});

module.exports = {
  recordPayment,
  getPayments,
  getPaymentById,
  updatePayment,
  deletePayment,
  refundPayment,
  reconcilePayments
};
