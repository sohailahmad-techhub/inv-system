const asyncHandler = require('express-async-handler');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');

// @desc    Get invoice payment status
// @route   GET /invoices/:id/payment-status
// @access  Private
const getInvoicePaymentStatus = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate('clientId', 'firstName lastName email companyName');

  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }

  // Check authorization - clients can only see their own invoices
  if (req.user.role === 'CLIENT' && invoice.clientId._id.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to view this invoice');
  }

  // Get all payments for this invoice
  const payments = await Payment.find({ invoiceId: invoice._id })
    .sort({ date: -1 });

  // Calculate payment summary
  const completedPayments = payments.filter(p => p.status === 'Completed');
  const pendingPayments = payments.filter(p => p.status === 'Pending');
  const totalCompleted = completedPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalPending = pendingPayments.reduce((sum, p) => sum + p.amount, 0);

  res.json({
    success: true,
    data: {
      invoice: {
        id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        clientId: invoice.clientId,
        totalAmount: invoice.totalAmount,
        paidAmount: invoice.paidAmount,
        remainingBalance: invoice.totalAmount - invoice.paidAmount,
        paymentStatus: invoice.paymentStatus,
        dueDate: invoice.dueDate,
        currency: invoice.currency
      },
      paymentSummary: {
        totalCompleted,
        totalPending,
        completedCount: completedPayments.length,
        pendingCount: pendingPayments.length
      },
      payments
    }
  });
});

// @desc    Create invoice
// @route   POST /invoices
// @access  Private (ADMIN, ACCOUNTANT)
const createInvoice = asyncHandler(async (req, res) => {
  const {
    invoiceNumber,
    clientId,
    issueDate,
    dueDate,
    items,
    subtotal,
    tax,
    taxRate,
    discount,
    totalAmount,
    notes,
    terms,
    currency
  } = req.body;

  // Check if invoice number already exists
  const existingInvoice = await Invoice.findOne({ invoiceNumber });
  if (existingInvoice) {
    res.status(400);
    throw new Error('Invoice number already exists');
  }

  const invoice = await Invoice.create({
    invoiceNumber,
    clientId,
    issueDate: issueDate || Date.now(),
    dueDate,
    items,
    subtotal,
    tax: tax || 0,
    taxRate: taxRate || 0,
    discount: discount || 0,
    totalAmount,
    notes,
    terms,
    currency: currency || 'USD'
  });

  const populatedInvoice = await Invoice.findById(invoice._id)
    .populate('clientId', 'firstName lastName email companyName');

  res.status(201).json({
    success: true,
    message: 'Invoice created successfully',
    data: populatedInvoice
  });
});

// @desc    Get all invoices
// @route   GET /invoices
// @access  Private
const getInvoices = asyncHandler(async (req, res) => {
  const {
    clientId,
    paymentStatus,
    startDate,
    endDate,
    page = 1,
    limit = 10
  } = req.query;

  // Build filter object
  const filter = {};

  // Clients can only see their own invoices
  if (req.user.role === 'CLIENT') {
    filter.clientId = req.user._id;
  } else if (clientId) {
    filter.clientId = clientId;
  }

  if (paymentStatus) filter.paymentStatus = paymentStatus;

  if (startDate || endDate) {
    filter.issueDate = {};
    if (startDate) filter.issueDate.$gte = new Date(startDate);
    if (endDate) filter.issueDate.$lte = new Date(endDate);
  }

  // Calculate pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Get total count
  const total = await Invoice.countDocuments(filter);

  // Get invoices
  const invoices = await Invoice.find(filter)
    .populate('clientId', 'firstName lastName email companyName')
    .sort({ issueDate: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  res.json({
    success: true,
    data: invoices,
    pagination: {
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      limit: parseInt(limit)
    }
  });
});

// @desc    Get invoice by ID
// @route   GET /invoices/:id
// @access  Private
const getInvoiceById = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate('clientId', 'firstName lastName email companyName phone address');

  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }

  // Check authorization
  if (req.user.role === 'CLIENT' && invoice.clientId._id.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to view this invoice');
  }

  res.json({
    success: true,
    data: invoice
  });
});

// @desc    Update invoice
// @route   PUT /invoices/:id
// @access  Private (ADMIN, ACCOUNTANT)
const updateInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);

  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }

  // Don't allow updating paid invoices
  if (invoice.paymentStatus === 'Paid') {
    res.status(400);
    throw new Error('Cannot update a paid invoice');
  }

  const {
    dueDate,
    items,
    subtotal,
    tax,
    taxRate,
    discount,
    totalAmount,
    notes,
    terms
  } = req.body;

  if (dueDate) invoice.dueDate = dueDate;
  if (items) invoice.items = items;
  if (subtotal !== undefined) invoice.subtotal = subtotal;
  if (tax !== undefined) invoice.tax = tax;
  if (taxRate !== undefined) invoice.taxRate = taxRate;
  if (discount !== undefined) invoice.discount = discount;
  if (totalAmount !== undefined) invoice.totalAmount = totalAmount;
  if (notes !== undefined) invoice.notes = notes;
  if (terms !== undefined) invoice.terms = terms;

  await invoice.save();

  const updatedInvoice = await Invoice.findById(invoice._id)
    .populate('clientId', 'firstName lastName email companyName');

  res.json({
    success: true,
    message: 'Invoice updated successfully',
    data: updatedInvoice
  });
});

// @desc    Delete invoice
// @route   DELETE /invoices/:id
// @access  Private (ADMIN)
const deleteInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);

  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }

  // Check if invoice has payments
  const payments = await Payment.find({ invoiceId: invoice._id });
  if (payments.length > 0) {
    res.status(400);
    throw new Error('Cannot delete invoice with existing payments');
  }

  await invoice.deleteOne();

  res.json({
    success: true,
    message: 'Invoice deleted successfully'
  });
});

// @desc    Mark overdue invoices
// @route   POST /invoices/mark-overdue
// @access  Private (ADMIN, ACCOUNTANT)
const markOverdueInvoices = asyncHandler(async (req, res) => {
  const now = new Date();

  // Find all unpaid or partially paid invoices past due date
  const result = await Invoice.updateMany(
    {
      dueDate: { $lt: now },
      paymentStatus: { $in: ['Unpaid', 'Partially Paid'] }
    },
    {
      paymentStatus: 'Overdue'
    }
  );

  res.json({
    success: true,
    message: `Marked ${result.modifiedCount} invoices as overdue`,
    data: {
      count: result.modifiedCount
    }
  });
});

module.exports = {
  getInvoicePaymentStatus,
  createInvoice,
  getInvoices,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  markOverdueInvoices
};
