const asyncHandler = require('express-async-handler');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const User = require('../models/User');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// @desc    Get all invoices for a tenant
// @route   GET /api/invoices
// @access  Private
const getInvoices = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  
  // Get tenant ID from user or header
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  
  const query = { tenantId };
  
  // Apply filters
  if (req.query.status) {
    query.status = req.query.status;
  }
  if (req.query.clientId) {
    query.clientId = req.query.clientId;
  }
  if (req.query.dateFrom || req.query.dateTo) {
    query.issueDate = {};
    if (req.query.dateFrom) query.issueDate.$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo) query.issueDate.$lte = new Date(req.query.dateTo);
  }
  
  const invoices = await Invoice.find(query)
    .populate('clientId', 'firstName lastName email companyName')
    .populate('createdBy', 'firstName lastName email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
  
  const total = await Invoice.countDocuments(query);
  
  res.json({
    success: true,
    data: invoices,
    pagination: {
      current: page,
      pages: Math.ceil(total / limit),
      total
    }
  });
});

// @desc    Get single invoice
// @route   GET /api/invoices/:id
// @access  Private
const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate('clientId', 'firstName lastName email companyName phone address')
    .populate('createdBy', 'firstName lastName email')
    .populate('payments.paymentId');
  
  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }
  
  // Check tenant access
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (invoice.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  res.json({
    success: true,
    data: invoice
  });
});

// @desc    Create new invoice
// @route   POST /api/invoices
// @access  Private
const createInvoice = asyncHandler(async (req, res) => {
  const {
    clientId,
    items,
    taxRate,
    currency,
    issueDate,
    dueDate,
    notes,
    paymentTerms
  } = req.body;
  
  // Get tenant ID
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  
  // Validate client exists and belongs to same tenant
  const client = await User.findById(clientId);
  if (!client) {
    res.status(404);
    throw new Error('Client not found');
  }
  
  // Generate invoice number
  const invoiceCount = await Invoice.countDocuments({ tenantId });
  const invoiceNumber = `INV-${(invoiceCount + 1).toString().padStart(6, '0')}`;
  
  // Calculate totals and create items
  const processedItems = items.map(item => ({
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: item.quantity * item.unitPrice
  }));
  
  const invoice = await Invoice.create({
    invoiceNumber,
    clientId,
    createdBy: req.user._id,
    items: processedItems,
    taxRate: taxRate || 0,
    currency: currency || 'USD',
    issueDate: issueDate ? new Date(issueDate) : new Date(),
    dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    notes,
    paymentTerms,
    tenantId
  });
  
  // Run fraud detection
  await runFraudDetection(invoice._id);
  
  // Calculate payment prediction
  await calculatePaymentPrediction(invoice._id);
  
  // Generate QR code
  await generateQRCode(invoice._id);
  
  // Trigger webhook
  await triggerWebhook('invoice.created', invoice);
  
  const populatedInvoice = await Invoice.findById(invoice._id)
    .populate('clientId', 'firstName lastName email companyName')
    .populate('createdBy', 'firstName lastName email');
  
  res.status(201).json({
    success: true,
    data: populatedInvoice
  });
});

// @desc    Update invoice
// @route   PUT /api/invoices/:id
// @access  Private
const updateInvoice = asyncHandler(async (req, res) => {
  let invoice = await Invoice.findById(req.params.id);
  
  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }
  
  // Check tenant access
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (invoice.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  // Check if invoice can be edited
  if (invoice.status === 'paid' || invoice.status === 'cancelled') {
    res.status(400);
    throw new Error('Cannot edit paid or cancelled invoice');
  }
  
  // Update fields
  const {
    items,
    taxRate,
    currency,
    dueDate,
    notes,
    paymentTerms,
    qrCodeSize,
    qrCodePosition
  } = req.body;
  
  if (items) {
    invoice.items = items.map(item => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.quantity * item.unitPrice
    }));
  }
  
  if (taxRate !== undefined) invoice.taxRate = taxRate;
  if (currency) invoice.currency = currency;
  if (dueDate) invoice.dueDate = new Date(dueDate);
  if (notes !== undefined) invoice.notes = notes;
  if (paymentTerms) invoice.paymentTerms = paymentTerms;
  if (qrCodeSize) invoice.qrCodeSize = qrCodeSize;
  if (qrCodePosition) invoice.qrCodePosition = qrCodePosition;
  
  await invoice.save();
  
  // Re-run fraud detection and payment prediction if amounts changed
  if (items || taxRate) {
    await runFraudDetection(invoice._id);
    await calculatePaymentPrediction(invoice._id);
    await generateQRCode(invoice._id);
  }
  
  const updatedInvoice = await Invoice.findById(invoice._id)
    .populate('clientId', 'firstName lastName email companyName')
    .populate('createdBy', 'firstName lastName email');
  
  res.json({
    success: true,
    data: updatedInvoice
  });
});

// @desc    Delete invoice
// @route   DELETE /api/invoices/:id
// @access  Private
const deleteInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  
  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }
  
  // Check tenant access
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (invoice.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  // Check if invoice can be deleted
  if (invoice.status === 'paid') {
    res.status(400);
    throw new Error('Cannot delete paid invoice');
  }
  
  await Invoice.findByIdAndDelete(req.params.id);
  
  res.json({
    success: true,
    message: 'Invoice deleted'
  });
});

// @desc    Send invoice
// @route   POST /api/invoices/:id/send
// @access  Private
const sendInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  
  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }
  
  // Check tenant access
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (invoice.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  // Check if fraud flagged
  if (invoice.fraudCheck.isFlagged && !invoice.fraudCheck.reviewedBy) {
    res.status(400);
    throw new Error('Invoice flagged for fraud review');
  }
  
  invoice.status = 'sent';
  invoice.lastSent = new Date();
  await invoice.save();
  
  // Generate PDF
  await generateInvoicePDF(invoice._id);
  
  // Trigger webhook
  await triggerWebhook('invoice.sent', invoice);
  
  res.json({
    success: true,
    message: 'Invoice sent successfully',
    data: invoice
  });
});

// @desc    Mark invoice as paid
// @route   POST /api/invoices/:id/mark-paid
// @access  Private
const markInvoicePaid = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  
  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }
  
  // Check tenant access
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (invoice.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  const { paymentMethod, reference, notes } = req.body;
  
  // Create payment record
  const payment = await Payment.create({
    invoiceId: invoice._id,
    clientId: invoice.clientId,
    amount: invoice.total,
    method: paymentMethod,
    status: 'completed',
    paymentDate: new Date(),
    reference,
    notes,
    tenantId
  });
  
  // Update invoice
  invoice.status = 'paid';
  invoice.paidDate = new Date();
  invoice.payments.push({
    paymentId: payment._id,
    amount: invoice.total,
    date: new Date(),
    method: paymentMethod
  });
  
  await invoice.save();
  
  // Trigger webhook
  await triggerWebhook('invoice.paid', { ...invoice.toObject(), payment });
  await triggerWebhook('payment.received', { ...payment.toObject(), invoice });
  
  res.json({
    success: true,
    message: 'Invoice marked as paid',
    data: { invoice, payment }
  });
});

// @desc    Generate invoice PDF
// @route   GET /api/invoices/:id/pdf
// @access  Private
const generateInvoicePDF = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate('clientId', 'firstName lastName email companyName address')
    .populate('createdBy', 'firstName lastName email companyName');
  
  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }
  
  // Check tenant access
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (invoice.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  const pdfBuffer = await createInvoicePDF(invoice);
  
  // Update invoice PDF status
  invoice.pdfGenerated = true;
  await invoice.save();
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoice.invoiceNumber}.pdf`);
  res.send(pdfBuffer);
});

// @desc    Get payment prediction for invoice
// @route   GET /api/invoices/:id/payment-prediction
// @access  Private
const getPaymentPrediction = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  
  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }
  
  // Check tenant access
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (invoice.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  // Recalculate if older than 24 hours
  const shouldRecalculate = !invoice.paymentPrediction.lastCalculated || 
    (new Date() - invoice.paymentPrediction.lastCalculated) > 24 * 60 * 60 * 1000;
  
  if (shouldRecalculate) {
    await calculatePaymentPrediction(invoice._id);
    await invoice.populate('paymentPrediction');
  }
  
  res.json({
    success: true,
    data: invoice.paymentPrediction
  });
});

// @desc    Get fraud check results
// @route   GET /api/invoices/:id/fraud-check
// @access  Private
const getFraudCheck = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  
  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }
  
  // Check tenant access
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (invoice.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  res.json({
    success: true,
    data: invoice.fraudCheck
  });
});

// @desc    Review fraud flag
// @route   POST /api/invoices/:id/fraud-review
// @access  Private (Admin only)
const reviewFraudFlag = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  
  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }
  
  // Check tenant access
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (invoice.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  const { approved, reason } = req.body;
  
  invoice.fraudCheck.reviewedBy = req.user._id;
  invoice.fraudCheck.reviewedAt = new Date();
  
  if (approved) {
    invoice.fraudCheck.isFlagged = false;
    invoice.fraudCheck.flags = [];
  }
  
  await invoice.save();
  
  res.json({
    success: true,
    message: 'Fraud review completed',
    data: invoice.fraudCheck
  });
});

// @desc    Generate QR code
// @route   GET /api/invoices/:id/qr-code
// @access  Private
const generateQRCode = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  
  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }
  
  // Check tenant access
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (invoice.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  const qrCodeDataURL = await QRCode.toDataURL(invoice.qrCodeData, {
    width: invoice.qrCodeSize,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  });
  
  invoice.qrCodeGenerated = true;
  await invoice.save();
  
  res.json({
    success: true,
    data: {
      qrCodeDataURL,
      paymentUrl: invoice.qrCodeData,
      size: invoice.qrCodeSize
    }
  });
});

// Helper function to run fraud detection
async function runFraudDetection(invoiceId) {
  const invoice = await Invoice.findById(invoiceId).populate('clientId');
  
  const flags = [];
  let riskScore = 0;
  
  // Check amount against client history
  const clientInvoices = await Invoice.find({ 
    clientId: invoice.clientId._id,
    _id: { $ne: invoiceId }
  });
  
  if (clientInvoices.length > 0) {
    const amounts = clientInvoices.map(inv => inv.total);
    const avgAmount = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
    const stdDev = Math.sqrt(amounts.reduce((sum, amount) => sum + Math.pow(amount - avgAmount, 2), 0) / amounts.length);
    
    if (Math.abs(invoice.total - avgAmount) > 2 * stdDev) {
      flags.push('Unusual amount compared to client history');
      riskScore += 0.3;
    }
  }
  
  // Check payment frequency
  const recentInvoices = await Invoice.find({
    clientId: invoice.clientId._id,
    createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    _id: { $ne: invoiceId }
  });
  
  if (recentInvoices.length > 5) {
    flags.push('High frequency of invoices');
    riskScore += 0.2;
  }
  
  // Check for duplicate invoice numbers
  const existingInvoice = await Invoice.findOne({
    invoiceNumber: invoice.invoiceNumber,
    _id: { $ne: invoiceId }
  });
  
  if (existingInvoice) {
    flags.push('Duplicate invoice number detected');
    riskScore += 0.5;
  }
  
  // Simple risk scoring
  invoice.fraudCheck = {
    isFlagged: riskScore > 0.5,
    riskScore,
    flags,
    lastChecked: new Date()
  };
  
  await invoice.save();
}

// Helper function to calculate payment prediction
async function calculatePaymentPrediction(invoiceId) {
  const invoice = await Invoice.findById(invoiceId).populate('clientId');
  
  // Get client payment history
  const clientPayments = await Payment.aggregate([
    { $match: { clientId: invoice.clientId._id } },
    { $group: { 
      _id: null,
      avgPaymentTime: { $avg: '$paymentDate' },
      totalPayments: { $sum: 1 },
      onTimePayments: {
        $sum: {
          $cond: [
            { $lte: ['$paymentDate', invoice.dueDate] },
            1,
            0
          ]
        }
      }
    }}
  ]);
  
  let likelihood = 0.7; // Base probability
  let predictedDate = new Date(invoice.dueDate);
  
  if (clientPayments.length > 0) {
    const history = clientPayments[0];
    const onTimeRate = history.onTimePayments / history.totalPayments;
    
    // Adjust likelihood based on payment history
    likelihood = onTimeRate * 0.8 + 0.2; // Base on history with minimum 20%
    
    // Adjust prediction date based on average payment time
    const daysFromIssue = (new Date(history.avgPaymentTime) - new Date(invoice.issueDate)) / (1000 * 60 * 60 * 24);
    predictedDate = new Date(new Date(invoice.issueDate).getTime() + daysFromIssue * 24 * 60 * 60 * 1000);
  }
  
  // Adjust based on invoice amount (smaller amounts more likely to be paid)
  if (invoice.total < 100) likelihood += 0.1;
  else if (invoice.total > 10000) likelihood -= 0.2;
  
  // Adjust based on days until due date
  const daysUntilDue = (invoice.dueDate - new Date()) / (1000 * 60 * 60 * 24);
  if (daysUntilDue > 30) likelihood -= 0.1;
  else if (daysUntilDue < 7) likelihood += 0.1;
  
  likelihood = Math.max(0, Math.min(1, likelihood)); // Clamp between 0 and 1
  
  invoice.paymentPrediction = {
    likelihood,
    predictedDate,
    confidence: 0.8, // Fixed confidence for now
    lastCalculated: new Date()
  };
  
  await invoice.save();
}

// Helper function to create PDF
async function createInvoicePDF(invoice) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Generate HTML template
  const html = generateInvoiceHTML(invoice);
  
  await page.setContent(html);
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: {
      top: '20px',
      right: '20px',
      bottom: '20px',
      left: '20px'
    }
  });
  
  await browser.close();
  return pdfBuffer;
}

// Helper function to generate invoice HTML
function generateInvoiceHTML(invoice) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Invoice ${invoice.invoiceNumber}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
        .company-info { text-align: right; }
        .invoice-title { font-size: 28px; font-weight: bold; margin-bottom: 10px; }
        .invoice-details { margin-bottom: 30px; }
        .client-info, .company-info { margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f5f5f5; font-weight: bold; }
        .totals { text-align: right; margin-top: 20px; }
        .total-row { display: flex; justify-content: space-between; padding: 5px 0; }
        .grand-total { font-weight: bold; font-size: 18px; border-top: 2px solid #000; padding-top: 10px; }
        .qr-code { position: absolute; bottom: 50px; right: 50px; text-align: center; }
        .qr-code img { max-width: 150px; }
        .payment-info { margin-top: 30px; font-size: 12px; color: #666; }
        .status { padding: 5px 10px; border-radius: 3px; font-weight: bold; }
        .status.paid { background-color: #d4edda; color: #155724; }
        .status.sent { background-color: #d1ecf1; color: #0c5460; }
        .status.overdue { background-color: #f8d7da; color: #721c24; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1 class="invoice-title">INVOICE</h1>
          <div class="invoice-details">
            <p><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
            <p><strong>Issue Date:</strong> ${invoice.issueDate.toLocaleDateString()}</p>
            <p><strong>Due Date:</strong> ${invoice.dueDate.toLocaleDateString()}</p>
            <p><strong>Status:</strong> <span class="status ${invoice.status}">${invoice.status.toUpperCase()}</span></p>
          </div>
        </div>
        <div class="company-info">
          <h3>${invoice.createdBy.companyName || 'Your Company'}</h3>
          <p>${invoice.createdBy.firstName} ${invoice.createdBy.lastName}</p>
          <p>${invoice.createdBy.email}</p>
          ${invoice.createdBy.phone ? `<p>${invoice.createdBy.phone}</p>` : ''}
        </div>
      </div>
      
      <div style="display: flex; justify-content: space-between;">
        <div class="client-info">
          <h3>Bill To:</h3>
          <p><strong>${invoice.clientId.companyName || `${invoice.clientId.firstName} ${invoice.clientId.lastName}`}</strong></p>
          <p>${invoice.clientId.email}</p>
          ${invoice.clientId.phone ? `<p>${invoice.clientId.phone}</p>` : ''}
          ${invoice.clientId.address ? `
            <p>${invoice.clientId.address.street || ''}<br>
            ${invoice.clientId.address.city || ''}, ${invoice.clientId.address.state || ''} ${invoice.clientId.address.zipCode || ''}<br>
            ${invoice.clientId.address.country || ''}</p>
          ` : ''}
        </div>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Quantity</th>
            <th>Unit Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${invoice.items.map(item => `
            <tr>
              <td>${item.description}</td>
              <td>${item.quantity}</td>
              <td>${invoice.currency} ${item.unitPrice.toFixed(2)}</td>
              <td>${invoice.currency} ${item.total.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <div class="totals">
        <div class="total-row">
          <span>Subtotal:</span>
          <span>${invoice.currency} ${invoice.subtotal.toFixed(2)}</span>
        </div>
        ${invoice.taxAmount > 0 ? `
          <div class="total-row">
            <span>Tax (${invoice.taxRate}%):</span>
            <span>${invoice.currency} ${invoice.taxAmount.toFixed(2)}</span>
          </div>
        ` : ''}
        <div class="total-row grand-total">
          <span>Total:</span>
          <span>${invoice.currency} ${invoice.total.toFixed(2)}</span>
        </div>
      </div>
      
      ${invoice.notes ? `
        <div style="margin-top: 30px;">
          <h4>Notes:</h4>
          <p>${invoice.notes}</p>
        </div>
      ` : ''}
      
      ${invoice.paymentPrediction ? `
        <div class="payment-info">
          <p><strong>Payment Prediction:</strong> ${(invoice.paymentPrediction.likelihood * 100).toFixed(1)}% likely to be paid by ${invoice.paymentPrediction.predictedDate.toLocaleDateString()}</p>
        </div>
      ` : ''}
      
      <div class="qr-code">
        ${invoice.qrCodeGenerated ? `<p>Scan to pay</p>` : ''}
      </div>
    </body>
    </html>
  `;
}

// Helper function to trigger webhooks
async function triggerWebhook(event, data) {
  // This would integrate with your webhook system
  console.log(`Triggering webhook for event: ${event}`);
  // Implementation would go here
}

module.exports = {
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
};
