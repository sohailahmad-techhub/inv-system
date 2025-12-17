const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema({
  description: {
    type: String,
    required: true,
    trim: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  amount: {
    type: Number,
    min: 0
  },
  total: {
    type: Number,
    required: true,
    min: 0
  }
});

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: true,
    unique: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [invoiceItemSchema],
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  taxRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  taxAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  tax: {
    type: Number,
    default: 0,
    min: 0
  },
  discount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalAmount: {
    type: Number,
    min: 0
  },
  paidAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  paymentStatus: {
    type: String,
    enum: ['Unpaid', 'Paid', 'Partially Paid', 'Overdue'],
    default: 'Unpaid'
  },
  total: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD',
    uppercase: true
  },
  status: {
    type: String,
    enum: ['draft', 'sent', 'viewed', 'paid', 'overdue', 'cancelled'],
    default: 'draft'
  },
  issueDate: {
    type: Date,
    required: true
  },
  dueDate: {
    type: Date,
    required: true
  },
  paidDate: {
    type: Date
  },
  notes: {
    type: String,
    trim: true
  },
  terms: {
    type: String,
    trim: true
  },
  paymentTerms: {
    type: String,
    default: 'Net 30 days'
  },
  // QR Code related fields
  qrCodeData: {
    type: String
  },
  qrCodeGenerated: {
    type: Boolean,
    default: false
  },
  qrCodeSize: {
    type: Number,
    default: 200
  },
  qrCodePosition: {
    x: { type: Number, default: 450 },
    y: { type: Number, default: 700 }
  },
  // AI Prediction fields
  paymentPrediction: {
    likelihood: { type: Number, min: 0, max: 1 },
    predictedDate: { type: Date },
    confidence: { type: Number, min: 0, max: 1 },
    lastCalculated: { type: Date }
  },
  // Fraud Detection fields
  fraudCheck: {
    isFlagged: { type: Boolean, default: false },
    riskScore: { type: Number, min: 0, max: 1 },
    flags: [{ type: String }],
    lastChecked: { type: Date },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date }
  },
  // Tax and region fields
  taxRegion: {
    type: String,
    enum: ['US', 'EU', 'INDIA', 'UK', 'CANADA', 'OTHER'],
    default: 'US'
  },
  taxObligations: [{
    region: String,
    taxType: String, // GST, VAT, Sales Tax
    rate: Number,
    amount: Number,
    filed: { type: Boolean, default: false },
    filingDate: Date
  }],
  // Integration fields
  externalIds: {
    quickbooksId: String,
    xeroId: String,
    freshbooksId: String
  },
  syncStatus: {
    quickbooks: { type: String, enum: ['pending', 'synced', 'failed'], default: 'pending' },
    xero: { type: String, enum: ['pending', 'synced', 'failed'], default: 'pending' },
    freshbooks: { type: String, enum: ['pending', 'synced', 'failed'], default: 'pending' }
  },
  // Payment tracking
  payments: [{
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    amount: Number,
    date: Date,
    method: String
  }],
  // Bulk generation tracking
  bulkGenerated: {
    batchId: String,
    rowNumber: Number
  },
  // Multitenancy
  tenantId: {
    type: String,
    required: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  // PDF and metadata
  pdfUrl: String,
  pdfGenerated: { type: Boolean, default: false },
  lastSent: Date,
  reminderSent: { type: Boolean, default: false },
  overdueNotified: { type: Boolean, default: false }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ clientId: 1 });
invoiceSchema.index({ createdBy: 1 });
invoiceSchema.index({ status: 1 });
invoiceSchema.index({ dueDate: 1 });
invoiceSchema.index({ tenantId: 1 });
invoiceSchema.index({ createdAt: -1 });

// Virtual for days overdue
invoiceSchema.virtual('daysOverdue').get(function() {
  if (this.status !== 'paid' && new Date() > this.dueDate) {
    return Math.ceil((new Date() - this.dueDate) / (1000 * 60 * 60 * 24));
  }
  return 0;
});

// Virtual for total paid
invoiceSchema.virtual('totalPaid').get(function() {
  if (typeof this.paidAmount === 'number') {
    return this.paidAmount;
  }

  return this.payments.reduce((total, payment) => total + (payment.amount || 0), 0);
});

// Virtual for remaining balance
invoiceSchema.virtual('remainingBalance').get(function() {
  const invoiceTotal = typeof this.totalAmount === 'number' ? this.totalAmount : this.total;
  return Math.max(0, invoiceTotal - this.totalPaid);
});

// Pre-save middleware to calculate totals and payment status
invoiceSchema.pre('save', function(next) {
  this.items = (this.items || []).map((item) => {
    const qty = typeof item.quantity === 'number' ? item.quantity : 0;
    const unitPrice = typeof item.unitPrice === 'number' ? item.unitPrice : 0;
    const lineAmount =
      typeof item.amount === 'number'
        ? item.amount
        : typeof item.total === 'number'
          ? item.total
          : qty * unitPrice;

    item.amount = lineAmount;
    item.total = lineAmount;
    return item;
  });

  this.subtotal = this.items.reduce((sum, item) => sum + (item.total || 0), 0);

  const computedTax = this.subtotal * (this.taxRate / 100);
  this.taxAmount = typeof this.tax === 'number' ? this.tax : computedTax;
  this.tax = this.taxAmount;

  const discount = typeof this.discount === 'number' ? this.discount : 0;
  this.totalAmount = this.subtotal + this.taxAmount - discount;
  this.total = this.totalAmount;

  const totalAmount = typeof this.totalAmount === 'number' ? this.totalAmount : this.total;
  const paidAmount = typeof this.paidAmount === 'number' ? this.paidAmount : 0;

  let paymentStatus = 'Unpaid';
  if (paidAmount >= totalAmount && totalAmount > 0) {
    paymentStatus = 'Paid';
  } else if (paidAmount > 0) {
    paymentStatus = 'Partially Paid';
  }

  if (paymentStatus !== 'Paid' && this.dueDate && new Date() > this.dueDate) {
    paymentStatus = 'Overdue';
  }

  this.paymentStatus = paymentStatus;

  if (paymentStatus === 'Paid') {
    this.status = 'paid';
    if (!this.paidDate) {
      this.paidDate = new Date();
    }
  } else if (paymentStatus === 'Overdue' && this.status !== 'paid') {
    this.status = 'overdue';
  }

  this.qrCodeData = `${process.env.BASE_URL || 'http://localhost:3000'}/pay/${this._id}`;

  next();
});

// Method to check if invoice is overdue
invoiceSchema.methods.isOverdue = function() {
  return this.status !== 'paid' && new Date() > this.dueDate;
};

// Method to get payment likelihood
invoiceSchema.methods.getPaymentLikelihood = function() {
  return this.paymentPrediction ? this.paymentPrediction.likelihood : 0;
};

module.exports = mongoose.model('Invoice', invoiceSchema);
