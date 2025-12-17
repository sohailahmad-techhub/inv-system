const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    paymentNumber: {
      type: String,
      unique: true,
      index: true
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      required: true,
      index: true
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
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
      enum: ['Cash', 'BankTransfer', 'Card', 'Stripe', 'PayPal'],
      required: true
    },
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Failed', 'Refunded'],
      default: 'Pending',
      index: true
    },
    paymentDate: {
      type: Date,
      default: Date.now,
      index: true
    },
    reference: {
      type: String,
      trim: true
    },
    transactionId: {
      type: String,
      trim: true,
      index: true
    },
    fees: {
      type: Number,
      default: 0,
      min: 0
    },
    netAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed
    },
    refundId: {
      type: String,
      trim: true
    },
    refundedAmount: {
      type: Number,
      min: 0
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
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    tenantId: {
      type: String,
      default: 'default',
      index: true
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

paymentSchema.virtual('date').get(function() {
  return this.paymentDate;
});

paymentSchema.pre('validate', function(next) {
  if (!this.paymentNumber) {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.paymentNumber = `PAY-${timestamp}-${random}`;
  }

  if (typeof this.netAmount !== 'number' || this.netAmount === 0) {
    this.netAmount = Math.max(0, (this.amount || 0) - (this.fees || 0));
  }

  next();
});

module.exports = mongoose.model('Payment', paymentSchema);
