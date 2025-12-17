const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  paymentNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
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
    required: true,
    default: 'USD',
    uppercase: true
  },
  paymentMethod: {
    type: String,
    enum: ['CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'CHECK', 'PAYPAL', 'STRIPE', 'OTHER'],
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'],
    default: 'PENDING'
  },
  transactionId: {
    type: String,
    trim: true
  },
  referenceNumber: {
    type: String,
    trim: true
  },
  paymentDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  processedDate: {
    type: Date
  },
  failureReason: {
    type: String,
    trim: true
  },
  fees: {
    type: Number,
    default: 0,
    min: 0
  },
  netAmount: {
    type: Number,
    required: true,
    min: 0
  },
  notes: {
    type: String,
    trim: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
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
paymentSchema.index({ invoiceId: 1 });
paymentSchema.index({ clientId: 1 });
paymentSchema.index({ paymentNumber: 1 });
paymentSchema.index({ paymentDate: -1 });
paymentSchema.index({ paymentMethod: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ amount: 1 });
paymentSchema.index({ processedDate: -1 });
paymentSchema.index({ createdAt: -1 });

// Virtual for processing time
paymentSchema.virtual('processingTime').get(function() {
  if (this.processedDate && this.paymentDate) {
    const diffTime = this.processedDate - this.paymentDate;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // days
  }
  return null;
});

// Pre-save middleware to calculate net amount
paymentSchema.pre('save', function(next) {
  this.netAmount = this.amount - this.fees;
  if (this.status === 'COMPLETED' && !this.processedDate) {
    this.processedDate = new Date();
  }
  next();
});

// Static method to generate payment number
paymentSchema.statics.generatePaymentNumber = async function() {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  
  const lastPayment = await this.findOne({
    paymentNumber: new RegExp(`^PAY-${year}${month}`)
  }).sort({ paymentNumber: -1 });

  let sequence = 1;
  if (lastPayment) {
    const lastSequence = parseInt(lastPayment.paymentNumber.split('-')[2]);
    sequence = lastSequence + 1;
  }

  return `PAY-${year}${month}-${String(sequence).padStart(4, '0')}`;
};

// Static method to get payments by method
paymentSchema.statics.getPaymentsByMethod = function() {
  return this.aggregate([
    { $match: { status: 'COMPLETED', isDeleted: false } },
    {
      $group: {
        _id: '$paymentMethod',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
        totalFees: { $sum: '$fees' },
        netAmount: { $sum: '$netAmount' }
      }
    },
    {
      $project: {
        paymentMethod: '$_id',
        totalAmount: 1,
        count: 1,
        totalFees: 1,
        netAmount: 1,
        _id: 0
      }
    },
    { $sort: { totalAmount: -1 } }
  ]);
};

// Static method to get payment analytics
paymentSchema.statics.getPaymentAnalytics = function(filters = {}) {
  const matchStage = { 
    status: 'COMPLETED', 
    isDeleted: false,
    ...filters 
  };

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalPayments: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        totalFees: { $sum: '$fees' },
        netAmount: { $sum: '$netAmount' },
        averagePayment: { $avg: '$amount' }
      }
    },
    {
      $project: {
        _id: 0,
        totalPayments: 1,
        totalAmount: { $round: ['$totalAmount', 2] },
        totalFees: { $round: ['$totalFees', 2] },
        netAmount: { $round: ['$netAmount', 2] },
        averagePayment: { $round: ['$averagePayment', 2] }
      }
    }
  ]);
};

module.exports = mongoose.model('Payment', paymentSchema);