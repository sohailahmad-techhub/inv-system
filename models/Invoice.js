const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: [true, 'Invoice number is required'],
    unique: true,
    trim: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Client ID is required']
  },
  issueDate: {
    type: Date,
    required: [true, 'Issue date is required'],
    default: Date.now
  },
  dueDate: {
    type: Date,
    required: [true, 'Due date is required']
  },
  items: [{
    description: {
      type: String,
      required: [true, 'Item description is required'],
      trim: true
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1']
    },
    unitPrice: {
      type: Number,
      required: [true, 'Unit price is required'],
      min: [0, 'Unit price cannot be negative']
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required']
    }
  }],
  subtotal: {
    type: Number,
    required: [true, 'Subtotal is required'],
    min: [0, 'Subtotal cannot be negative']
  },
  tax: {
    type: Number,
    default: 0,
    min: [0, 'Tax cannot be negative']
  },
  taxRate: {
    type: Number,
    default: 0,
    min: [0, 'Tax rate cannot be negative'],
    max: [100, 'Tax rate cannot exceed 100']
  },
  discount: {
    type: Number,
    default: 0,
    min: [0, 'Discount cannot be negative']
  },
  totalAmount: {
    type: Number,
    required: [true, 'Total amount is required'],
    min: [0, 'Total amount cannot be negative']
  },
  paidAmount: {
    type: Number,
    default: 0,
    min: [0, 'Paid amount cannot be negative']
  },
  paymentStatus: {
    type: String,
    enum: ['Unpaid', 'Paid', 'Partially Paid', 'Overdue'],
    default: 'Unpaid'
  },
  notes: {
    type: String,
    trim: true
  },
  terms: {
    type: String,
    trim: true
  },
  currency: {
    type: String,
    default: 'USD',
    uppercase: true,
    trim: true
  }
}, {
  timestamps: true
});

// Index for better query performance
invoiceSchema.index({ clientId: 1 });
invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ paymentStatus: 1 });
invoiceSchema.index({ dueDate: 1 });

// Virtual for remaining balance
invoiceSchema.virtual('remainingBalance').get(function() {
  return this.totalAmount - this.paidAmount;
});

// Method to update payment status
invoiceSchema.methods.updatePaymentStatus = function() {
  const now = new Date();
  
  if (this.paidAmount >= this.totalAmount) {
    this.paymentStatus = 'Paid';
  } else if (this.paidAmount > 0) {
    this.paymentStatus = 'Partially Paid';
  } else if (now > this.dueDate) {
    this.paymentStatus = 'Overdue';
  } else {
    this.paymentStatus = 'Unpaid';
  }
};

// Pre-save hook to update payment status
invoiceSchema.pre('save', function(next) {
  this.updatePaymentStatus();
  next();
});

module.exports = mongoose.model('Invoice', invoiceSchema);
