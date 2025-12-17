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
    min: 0,
    default: 1
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
    unique: true,
    trim: true
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
  taxAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  discountAmount: {
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
    required: true,
    default: 'USD',
    uppercase: true
  },
  status: {
    type: String,
    enum: ['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED'],
    default: 'DRAFT'
  },
  issueDate: {
    type: Date,
    required: true,
    default: Date.now
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
    trim: true,
    default: 'Net 30'
  },
  lateFee: {
    type: Number,
    default: 0,
    min: 0
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
invoiceSchema.index({ clientId: 1, status: 1 });
invoiceSchema.index({ createdBy: 1 });
invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ issueDate: -1 });
invoiceSchema.index({ dueDate: 1 });
invoiceSchema.index({ status: 1 });
invoiceSchema.index({ total: 1 });
invoiceSchema.index({ createdAt: -1 });

// Virtual for overdue status
invoiceSchema.virtual('isOverdue').get(function() {
  return this.status !== 'PAID' && this.status !== 'CANCELLED' && new Date() > this.dueDate;
});

// Virtual for days overdue
invoiceSchema.virtual('daysOverdue').get(function() {
  if (this.isOverdue) {
    const today = new Date();
    const dueDate = new Date(this.dueDate);
    const diffTime = today - dueDate;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  return 0;
});

// Pre-save middleware to calculate totals
invoiceSchema.pre('save', function(next) {
  if (this.items && this.items.length > 0) {
    this.subtotal = this.items.reduce((sum, item) => sum + item.total, 0);
    this.total = this.subtotal + this.taxAmount - this.discountAmount + this.lateFee;
  }
  next();
});

// Static method to generate invoice number
invoiceSchema.statics.generateInvoiceNumber = async function() {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  
  // Get the last invoice number for this year-month
  const lastInvoice = await this.findOne({
    invoiceNumber: new RegExp(`^INV-${year}${month}`)
  }).sort({ invoiceNumber: -1 });

  let sequence = 1;
  if (lastInvoice) {
    const lastSequence = parseInt(lastInvoice.invoiceNumber.split('-')[2]);
    sequence = lastSequence + 1;
  }

  return `INV-${year}${month}-${String(sequence).padStart(4, '0')}`;
};

// Static method to get overdue invoices
invoiceSchema.statics.getOverdueInvoices = function() {
  return this.find({
    status: { $in: ['SENT', 'OVERDUE'] },
    dueDate: { $lt: new Date() },
    isDeleted: false
  });
};

// Method to mark as paid
invoiceSchema.methods.markAsPaid = function(paymentDate = new Date()) {
  this.status = 'PAID';
  this.paidDate = paymentDate;
  return this.save();
};

module.exports = mongoose.model('Invoice', invoiceSchema);