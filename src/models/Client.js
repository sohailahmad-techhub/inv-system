const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  phone: {
    type: String
  },
  whatsapp: {
    type: String
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  company: {
    type: String
  },
  taxId: {
    type: String
  },
  paymentTerms: {
    type: Number,
    default: 30 // days
  },
  preferredContactMethod: {
    type: String,
    enum: ['email', 'sms', 'whatsapp', 'email_sms', 'email_whatsapp', 'all'],
    default: 'email'
  },
  notificationsEnabled: {
    email: {
      type: Boolean,
      default: process.env.DEFAULT_EMAIL_REMINDERS === 'true'
    },
    sms: {
      type: Boolean,
      default: process.env.DEFAULT_SMS_REMINDERS === 'true'
    },
    whatsapp: {
      type: Boolean,
      default: process.env.DEFAULT_WHATSAPP_REMINDERS === 'true'
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  notes: String,
  lastInvoiceDate: Date,
  totalInvoices: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for performance
clientSchema.index({ email: 1 });
clientSchema.index({ company: 1 });
clientSchema.index({ status: 1 });
clientSchema.index({ createdAt: -1 });

// Update client stats when invoice is created
clientSchema.methods.updateStats = async function() {
  const Invoice = mongoose.model('Invoice');
  const stats = await Invoice.aggregate([
    { $match: { clientId: this._id } },
    {
      $group: {
        _id: null,
        totalInvoices: { $sum: 1 },
        totalAmount: { $sum: '$totalAmount' },
        lastInvoiceDate: { $max: '$createdAt' }
      }
    }
  ]);
  
  if (stats.length > 0) {
    this.totalInvoices = stats[0].totalInvoices;
    this.totalAmount = stats[0].totalAmount;
    this.lastInvoiceDate = stats[0].lastInvoiceDate;
    await this.save();
  }
};

module.exports = mongoose.model('Client', clientSchema);
