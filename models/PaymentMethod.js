const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  type: {
    type: String,
    enum: ['Cash', 'BankTransfer', 'Card', 'Stripe', 'PayPal'],
    required: [true, 'Payment method type is required']
  },
  details: {
    // For Bank Transfer
    bankName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    routingNumber: { type: String, trim: true },
    
    // For Card
    cardLast4: { type: String, trim: true },
    cardBrand: { type: String, trim: true },
    cardExpMonth: { type: Number },
    cardExpYear: { type: Number },
    
    // For Stripe
    stripeCustomerId: { type: String, trim: true },
    stripePaymentMethodId: { type: String, trim: true },
    
    // For PayPal
    paypalEmail: { type: String, trim: true },
    paypalPayerId: { type: String, trim: true }
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for better query performance
paymentMethodSchema.index({ userId: 1 });
paymentMethodSchema.index({ type: 1 });

// Ensure only one default payment method per user
paymentMethodSchema.pre('save', async function(next) {
  if (this.isDefault && this.isModified('isDefault')) {
    await this.constructor.updateMany(
      { userId: this.userId, _id: { $ne: this._id } },
      { isDefault: false }
    );
  }
  next();
});

module.exports = mongoose.model('PaymentMethod', paymentMethodSchema);
