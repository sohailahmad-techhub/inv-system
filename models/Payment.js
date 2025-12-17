const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  paymentId: {
    type: String,
    unique: true,
    required: true
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD',
    uppercase: true
  },
  method: {
    type: String,
    enum: ['credit_card', 'bank_transfer', 'cash', 'check', 'paypal', 'stripe', 'other'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded', 'cancelled'],
    default: 'pending'
  },
  paymentDate: {
    type: Date,
    default: Date.now
  },
  reference: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  },
  // External payment processor data
  externalData: {
    processor: String, // 'stripe', 'paypal', etc.
    transactionId: String,
    fee: Number,
    netAmount: Number,
    rawResponse: mongoose.Schema.Types.Mixed
  },
  // Receipt data
  receipt: {
    receiptNumber: String,
    receiptUrl: String,
    generatedAt: { type: Date, default: Date.now }
  },
  // Refund information
  refunds: [{
    amount: Number,
    reason: String,
    date: Date,
    refundId: String
  }],
  // Integration tracking
  syncStatus: {
    quickbooks: { type: String, enum: ['pending', 'synced', 'failed'], default: 'pending' },
    xero: { type: String, enum: ['pending', 'synced', 'failed'], default: 'pending' },
    freshbooks: { type: String, enum: ['pending', 'synced', 'failed'], default: 'pending' }
  },
  // Multitenancy
  tenantId: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Indexes
paymentSchema.index({ invoiceId: 1 });
paymentSchema.index({ clientId: 1 });
paymentSchema.index({ paymentId: 1 });
paymentSchema.index({ paymentDate: -1 });
paymentSchema.index({ tenantId: 1 });
paymentSchema.index({ status: 1 });

// Pre-save middleware to generate payment ID
paymentSchema.pre('save', function(next) {
  if (!this.paymentId) {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.paymentId = `PAY-${timestamp}-${random}`;
  }
  next();
});

module.exports = mongoose.model('Payment', paymentSchema);
