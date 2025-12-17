const asyncHandler = require('express-async-handler');
const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');

const getPayments = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const tenantId = req.user?.tenantId || 'default';

  const query = { tenantId, isDeleted: false };

  if (req.query.status) query.status = req.query.status;
  if (req.query.method) query.method = req.query.method;
  if (req.query.invoiceId) query.invoiceId = req.query.invoiceId;

  if (req.query.startDate || req.query.endDate) {
    query.paymentDate = {};
    if (req.query.startDate) query.paymentDate.$gte = new Date(req.query.startDate);
    if (req.query.endDate) query.paymentDate.$lte = new Date(req.query.endDate);
  }

  const payments = await Payment.find(query)
    .populate('invoiceId', 'invoiceNumber totalAmount paidAmount paymentStatus currency')
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

const getPayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ _id: req.params.id, isDeleted: false })
    .populate('invoiceId', 'invoiceNumber totalAmount paidAmount paymentStatus currency clientId')
    .populate('processedBy', 'firstName lastName email role');

  if (!payment) {
    return res.status(404).json({
      success: false,
      message: 'Payment not found'
    });
  }

  const tenantId = req.user?.tenantId || 'default';
  if (payment.tenantId !== tenantId) {
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }

  res.json({
    success: true,
    data: payment
  });
});

const createPayment = asyncHandler(async (req, res) => {
  const { invoiceId, amount, method = 'Cash', date, reference, notes } = req.body;

  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) {
    return res.status(404).json({
      success: false,
      message: 'Invoice not found'
    });
  }

  const tenantId = req.user?.tenantId || 'default';
  if (invoice.tenantId !== tenantId) {
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }

  const remainingBalance = invoice.totalAmount - invoice.paidAmount;
  const parsedAmount = parseFloat(amount);

  if (parsedAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Amount must be greater than zero'
    });
  }

  if (parsedAmount > remainingBalance) {
    return res.status(400).json({
      success: false,
      message: 'Payment amount exceeds remaining balance'
    });
  }

  const payment = await Payment.create({
    invoiceId: invoice._id,
    clientId: invoice.clientId,
    amount: parsedAmount,
    currency: invoice.currency,
    method,
    status: 'Completed',
    paymentDate: date ? new Date(date) : new Date(),
    reference,
    notes,
    processedBy: req.user._id,
    tenantId
  });

  invoice.paidAmount = (invoice.paidAmount || 0) + parsedAmount;
  invoice.payments.push({
    paymentId: payment._id,
    amount: parsedAmount,
    date: payment.paymentDate,
    method
  });

  await invoice.save();

  const populatedPayment = await Payment.findById(payment._id).populate(
    'invoiceId',
    'invoiceNumber totalAmount paidAmount paymentStatus currency'
  );

  res.status(201).json({
    success: true,
    message: 'Payment recorded successfully',
    data: populatedPayment
  });
});

const updatePayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ _id: req.params.id, isDeleted: false });

  if (!payment) {
    return res.status(404).json({
      success: false,
      message: 'Payment not found'
    });
  }

  const tenantId = req.user?.tenantId || 'default';
  if (payment.tenantId !== tenantId) {
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }

  if (req.body.status) {
    payment.status = req.body.status;
  }
  if (req.body.notes !== undefined) {
    payment.notes = req.body.notes;
  }

  await payment.save();

  const updatedPayment = await Payment.findById(payment._id).populate(
    'invoiceId',
    'invoiceNumber totalAmount paidAmount paymentStatus currency'
  );

  res.json({
    success: true,
    message: 'Payment updated successfully',
    data: updatedPayment
  });
});

const deletePayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ _id: req.params.id, isDeleted: false });

  if (!payment) {
    return res.status(404).json({
      success: false,
      message: 'Payment not found'
    });
  }

  const tenantId = req.user?.tenantId || 'default';
  if (payment.tenantId !== tenantId) {
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }

  if (payment.status !== 'Pending') {
    return res.status(400).json({
      success: false,
      message: 'Only pending payments can be deleted'
    });
  }

  payment.isDeleted = true;
  await payment.save();

  res.json({
    success: true,
    message: 'Payment deleted successfully'
  });
});

const refundPayment = asyncHandler(async (req, res) => {
  const { amount, reason } = req.body;

  const payment = await Payment.findOne({ _id: req.params.id, isDeleted: false });

  if (!payment) {
    return res.status(404).json({
      success: false,
      message: 'Payment not found'
    });
  }

  const tenantId = req.user?.tenantId || 'default';
  if (payment.tenantId !== tenantId) {
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }

  if (payment.status !== 'Completed') {
    return res.status(400).json({
      success: false,
      message: 'Only completed payments can be refunded'
    });
  }

  const refundAmount = amount ? parseFloat(amount) : payment.amount;
  if (refundAmount <= 0 || refundAmount > payment.amount) {
    return res.status(400).json({
      success: false,
      message: 'Invalid refund amount'
    });
  }

  payment.status = 'Refunded';
  payment.refundedAmount = refundAmount;
  payment.refundedAt = new Date();
  payment.refundId = payment.refundId || `RFD-${Date.now()}`;
  payment.notes = [payment.notes, reason].filter(Boolean).join(' | ');
  await payment.save();

  const invoice = await Invoice.findById(payment.invoiceId);
  if (invoice) {
    invoice.paidAmount = Math.max(0, (invoice.paidAmount || 0) - refundAmount);
    await invoice.save();
  }

  const populatedPayment = await Payment.findById(payment._id).populate(
    'invoiceId',
    'invoiceNumber totalAmount paidAmount paymentStatus currency'
  );

  res.json({
    success: true,
    message: 'Payment refunded successfully',
    data: populatedPayment
  });
});

const reconcilePayments = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || 'default';

  const invoices = await Invoice.find({ tenantId }).select('_id invoiceNumber totalAmount paidAmount');

  const discrepancies = [];

  for (const invoice of invoices) {
    const payments = await Payment.find({
      tenantId,
      isDeleted: false,
      invoiceId: invoice._id,
      status: { $in: ['Completed', 'Refunded'] }
    }).select('amount refundedAmount status');

    const grossPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

    const totalRefunded = payments.reduce((sum, p) => sum + (p.refundedAmount || 0), 0);

    const expectedPaidAmount = grossPaid - totalRefunded;

    if (Math.abs((invoice.paidAmount || 0) - expectedPaidAmount) > 0.009) {
      discrepancies.push({
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        invoicePaidAmount: invoice.paidAmount || 0,
        expectedPaidAmount
      });
    }
  }

  res.json({
    success: true,
    data: {
      totalInvoices: invoices.length,
      discrepancies
    }
  });
});

const processExternalPayment = asyncHandler(async (req, res) => {
  res.status(400).json({
    success: false,
    message: 'External payment processing is handled by /stripe and /paypal endpoints'
  });
});

const getPaymentAnalytics = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || 'default';

  const match = {
    tenantId,
    isDeleted: false,
    status: 'Completed'
  };

  const byMethod = await Payment.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$method',
        count: { $sum: 1 },
        amount: { $sum: '$amount' },
        fees: { $sum: '$fees' },
        netAmount: { $sum: '$netAmount' }
      }
    },
    {
      $project: {
        _id: 0,
        method: '$_id',
        count: 1,
        amount: { $round: ['$amount', 2] },
        fees: { $round: ['$fees', 2] },
        netAmount: { $round: ['$netAmount', 2] }
      }
    },
    { $sort: { netAmount: -1 } }
  ]);

  res.json({
    success: true,
    data: {
      byMethod
    }
  });
});

const generatePaymentReceipt = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ _id: req.params.id, isDeleted: false })
    .populate('invoiceId', 'invoiceNumber currency totalAmount')
    .populate('clientId', 'firstName lastName email companyName');

  if (!payment) {
    return res.status(404).json({
      success: false,
      message: 'Payment not found'
    });
  }

  res.json({
    success: true,
    data: {
      receiptNumber: payment.paymentNumber,
      payment: {
        id: payment._id,
        amount: payment.amount,
        currency: payment.currency,
        method: payment.method,
        status: payment.status,
        date: payment.paymentDate,
        reference: payment.reference,
        transactionId: payment.transactionId
      },
      invoice: {
        invoiceNumber: payment.invoiceId?.invoiceNumber
      },
      client: payment.clientId
        ? {
            name: `${payment.clientId.firstName} ${payment.clientId.lastName}`,
            email: payment.clientId.email,
            companyName: payment.clientId.companyName
          }
        : null
    }
  });
});

module.exports = {
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
};
