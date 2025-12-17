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
  return this.payments.reduce((total, payment) => total + payment.amount, 0);
});

// Virtual for remaining balance
invoiceSchema.virtual('remainingBalance').get(function() {
  return this.total - this.totalPaid;
});

// Pre-save middleware to calculate totals
invoiceSchema.pre('save', function(next) {
  // Calculate subtotal
  this.subtotal = this.items.reduce((sum, item) => sum + item.total, 0);
  
  // Calculate tax
  this.taxAmount = this.subtotal * (this.taxRate / 100);
  
  // Calculate total
  this.total = this.subtotal + this.taxAmount;
  
  // Update QR code data with payment URL
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