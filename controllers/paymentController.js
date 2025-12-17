const asyncHandler = require('express-async-handler');
const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');
const User = require('../models/User');

// @desc    Get all payments for a tenant
// @route   GET /api/payments
// @access  Private
const getPayments = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  
  const query = { tenantId };
  
  // Apply filters
  if (req.query.status) {
    query.status = req.query.status;
  }
  if (req.query.method) {
    query.method = req.query.method;
  }
  if (req.query.clientId) {
    query.clientId = req.query.clientId;
  }
  if (req.query.dateFrom || req.query.dateTo) {
    query.paymentDate = {};
    if (req.query.dateFrom) query.paymentDate.$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo) query.paymentDate.$lte = new Date(req.query.dateTo);
  }
  
  const payments = await Payment.find(query)
    .populate('invoiceId', 'invoiceNumber total status')
    .populate('clientId', 'firstName lastName email companyName')
    .sort({ paymentDate: -1 })
    .skip(skip)
    .limit(limit);
  
  const total = await Payment.countDocuments(query);
  
  res.json({
    success: true,
    data: payments,
    pagination: {
      current: page,
      pages: Math.ceil(total / limit),
      total
    }
  });
});

// @desc    Get single payment
// @route   GET /api/payments/:id
// @access  Private
const getPayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id)
    .populate('invoiceId')
    .populate('clientId', 'firstName lastName email companyName');
  
  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (payment.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  res.json({
    success: true,
    data: payment
  });
});

// @desc    Create new payment
// @route   POST /api/payments
// @access  Private
const createPayment = asyncHandler(async (req, res) => {
  const {
    invoiceId,
    amount,
    method,
    paymentDate,
    reference,
    notes,
    externalData
  } = req.body;
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  
  // Validate invoice exists and belongs to tenant
  const invoice = await Invoice.findOne({ 
    _id: invoiceId, 
    tenantId 
  }).populate('clientId');
  
  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }
  
  // Check if payment amount is valid
  const remainingBalance = invoice.total - invoice.totalPaid;
  if (amount > remainingBalance) {
    res.status(400);
    throw new Error('Payment amount exceeds remaining balance');
  }
  
  const payment = await Payment.create({
    invoiceId,
    clientId: invoice.clientId._id,
    amount,
    method,
    paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
    reference,
    notes,
    externalData,
    tenantId
  });
  
  // Update invoice with payment
  invoice.payments.push({
    paymentId: payment._id,
    amount,
    date: payment.paymentDate,
    method
  });
  
  // Check if invoice is fully paid
  const newTotalPaid = invoice.totalPaid + amount;
  if (newTotalPaid >= invoice.total) {
    invoice.status = 'paid';
    invoice.paidDate = payment.paymentDate;
  }
  
  await invoice.save();
  
  // Trigger webhooks
  await triggerWebhook('payment.received', { ...payment.toObject(), invoice });
  if (invoice.status === 'paid') {
    await triggerWebhook('invoice.paid', { ...invoice.toObject(), payment });
  }
  
  const populatedPayment = await Payment.findById(payment._id)
    .populate('invoiceId', 'invoiceNumber total status')
    .populate('clientId', 'firstName lastName email companyName');
  
  res.status(201).json({
    success: true,
    data: populatedPayment
  });
});

// @desc    Update payment
// @route   PUT /api/payments/:id
// @access  Private
const updatePayment = asyncHandler(async (req, res) => {
  let payment = await Payment.findById(req.params.id);
  
  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (payment.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  // Cannot update completed payments
  if (payment.status === 'completed') {
    res.status(400);
    throw new Error('Cannot update completed payment');
  }
  
  const {
    amount,
    method,
    paymentDate,
    reference,
    notes,
    status
  } = req.body;
  
  if (amount !== undefined) payment.amount = amount;
  if (method) payment.method = method;
  if (paymentDate) payment.paymentDate = new Date(paymentDate);
  if (reference !== undefined) payment.reference = reference;
  if (notes !== undefined) payment.notes = notes;
  if (status) payment.status = status;
  
  await payment.save();
  
  const updatedPayment = await Payment.findById(payment._id)
    .populate('invoiceId', 'invoiceNumber total status')
    .populate('clientId', 'firstName lastName email companyName');
  
  res.json({
    success: true,
    data: updatedPayment
  });
});

// @desc    Delete payment
// @route   DELETE /api/payments/:id
// @access  Private
const deletePayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id);
  
  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (payment.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  // Cannot delete completed payments
  if (payment.status === 'completed') {
    res.status(400);
    throw new Error('Cannot delete completed payment');
  }
  
  // Remove payment from invoice
  const invoice = await Invoice.findById(payment.invoiceId);
  if (invoice) {
    invoice.payments = invoice.payments.filter(p => p.paymentId.toString() !== payment._id.toString());
    
    // Update invoice status if needed
    if (invoice.totalPaid - payment.amount <= 0) {
      invoice.status = invoice.totalPaid > 0 ? 'partially_paid' : 'sent';
      invoice.paidDate = undefined;
    }
    
    await invoice.save();
  }
  
  await Payment.findByIdAndDelete(req.params.id);
  
  res.json({
    success: true,
    message: 'Payment deleted'
  });
});

// @desc    Process external payment (Stripe, PayPal, etc.)
// @route   POST /api/payments/:id/process-external
// @access  Private
const processExternalPayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id);
  
  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (payment.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  const { processor, paymentToken } = req.body;
  
  // This would integrate with actual payment processors
  // For now, we'll simulate the process
  try {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simulate success/failure (90% success rate)
    if (Math.random() > 0.1) {
      payment.status = 'completed';
      payment.externalData = {
        processor,
        transactionId: `txn_${Date.now()}`,
        fee: payment.amount * 0.029 + 0.30, // Stripe fee example
        netAmount: payment.amount - (payment.amount * 0.029 + 0.30),
        rawResponse: { status: 'succeeded', id: `pi_${Date.now()}` }
      };
      
      // Update invoice
      const invoice = await Invoice.findById(payment.invoiceId);
      if (invoice) {
        invoice.status = 'paid';
        invoice.paidDate = payment.paymentDate;
        await invoice.save();
        
        // Trigger webhook
        await triggerWebhook('payment.received', { ...payment.toObject(), invoice });
        await triggerWebhook('invoice.paid', invoice);
      }
    } else {
      payment.status = 'failed';
      payment.externalData = {
        processor,
        rawResponse: { status: 'failed', error: 'Card declined' }
      };
      
      await triggerWebhook('payment.failed', payment);
    }
    
    await payment.save();
    
    res.json({
      success: true,
      data: payment,
      message: payment.status === 'completed' ? 'Payment processed successfully' : 'Payment failed'
    });
    
  } catch (error) {
    payment.status = 'failed';
    payment.externalData = {
      processor,
      rawResponse: { status: 'failed', error: error.message }
    };
    
    await payment.save();
    
    res.status(400).json({
      success: false,
      message: 'Payment processing failed',
      error: error.message
    });
  }
});

// @desc    Get payment analytics
// @route   GET /api/payments/analytics
// @access  Private
const getPaymentAnalytics = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  const { period = '30d' } = req.query;
  
  let dateFilter = {};
  const now = new Date();
  
  switch (period) {
    case '7d':
      dateFilter = { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
      break;
    case '30d':
      dateFilter = { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
      break;
    case '90d':
      dateFilter = { $gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) };
      break;
    case '1y':
      dateFilter = { $gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) };
      break;
  }
  
  const analytics = await Payment.aggregate([
    { $match: { tenantId: tenantId, status: 'completed', paymentDate: dateFilter } },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        totalPayments: { $sum: 1 },
        avgPaymentAmount: { $avg: '$amount' },
        byMethod: {
          $push: {
            method: '$method',
            amount: '$amount'
          }
        }
      }
    }
  ]);
  
  const methodBreakdown = await Payment.aggregate([
    { $match: { tenantId: tenantId, status: 'completed', paymentDate: dateFilter } },
    {
      $group: {
        _id: '$method',
        count: { $sum: 1 },
        total: { $sum: '$amount' }
      }
    }
  ]);
  
  const dailyRevenue = await Payment.aggregate([
    { $match: { tenantId: tenantId, status: 'completed', paymentDate: dateFilter } },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$paymentDate' }
        },
        revenue: { $sum: '$amount' },
        payments: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  
  res.json({
    success: true,
    data: {
      summary: analytics[0] || {
        totalAmount: 0,
        totalPayments: 0,
        avgPaymentAmount: 0,
        byMethod: []
      },
      methodBreakdown,
      dailyRevenue
    }
  });
});

// @desc    Generate payment receipt
// @route   GET /api/payments/:id/receipt
// @access  Private
const generatePaymentReceipt = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id)
    .populate('invoiceId', 'invoiceNumber clientId')
    .populate('clientId', 'firstName lastName email companyName');
  
  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (payment.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  // Generate receipt number if not exists
  if (!payment.receipt.receiptNumber) {
    const receiptNumber = `RCP-${payment.paymentId}`;
    payment.receipt = {
      receiptNumber,
      generatedAt: new Date()
    };
    await payment.save();
  }
  
  res.json({
    success: true,
    data: {
      receiptNumber: payment.receipt.receiptNumber,
      receiptUrl: `/receipts/${payment.receipt.receiptNumber}`,
      payment: {
        paymentId: payment.paymentId,
        amount: payment.amount,
        currency: payment.currency,
        method: payment.method,
        paymentDate: payment.paymentDate,
        reference: payment.reference
      },
      invoice: {
        invoiceNumber: payment.invoiceId.invoiceNumber
      },
      client: {
        name: `${payment.clientId.firstName} ${payment.clientId.lastName}`,
        email: payment.clientId.email,
        companyName: payment.clientId.companyName
      }
    }
  });
});

// Helper function to trigger webhooks
async function triggerWebhook(event, data) {
  console.log(`Triggering webhook for event: ${event}`);
  // Implementation would go here
}

module.exports = {
  getPayments,
  getPayment,
  createPayment,
  updatePayment,
  deletePayment,
  processExternalPayment,
  getPaymentAnalytics,
  generatePaymentReceipt
};
