const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: [true, 'Invoice ID is required']
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount cannot be negative']
  },
  method: {
    type: String,
    enum: ['Cash', 'BankTransfer', 'Card', 'Stripe', 'PayPal'],
    required: [true, 'Payment method is required']
  },
  status: {
    type: String,
    enum: ['Pending', 'Completed', 'Failed', 'Refunded'],
    default: 'Pending'
  },
  date: {
    type: Date,
    default: Date.now,
    required: [true, 'Payment date is required']
  },
  reference: {
    type: String,
    trim: true
  },
  transactionId: {
    type: String,
    trim: true,
    sparse: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  refundId: {
    type: String,
    trim: true
  },
  refundedAmount: {
    type: Number,
    default: 0,
    min: [0, 'Refunded amount cannot be negative']
  },
  refundedAt: {
    type: Date
  },
  notes: {
    type: String,
    trim: true
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for better query performance
paymentSchema.index({ invoiceId: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ method: 1 });
paymentSchema.index({ transactionId: 1 });
paymentSchema.index({ date: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
