const mongoose = require('mongoose');

const recurringInvoiceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  clientEmail: {
    type: String,
    required: true
  },
  clientPhone: {
    type: String
  },
  clientWhatsApp: {
    type: String
  },
  invoiceTemplate: {
    description: String,
    items: [{
      description: {
        type: String,
        required: true
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
    }],
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
    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },
    notes: String,
    currency: {
      type: String,
      default: 'USD'
    }
  },
  frequency: {
    type: String,
    enum: ['weekly', 'monthly', 'quarterly', 'yearly'],
    required: true
  },
  nextDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date
  },
  active: {
    type: Boolean,
    default: true
  },
  paymentTerms: {
    type: Number,
    default: 30 // days
  },
  generatedInvoices: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice'
  }],
  lastGenerated: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for performance
recurringInvoiceSchema.index({ clientId: 1 });
recurringInvoiceSchema.index({ nextDate: 1 });
recurringInvoiceSchema.index({ active: 1, frequency: 1 });

// Calculate next date based on frequency
recurringInvoiceSchema.methods.calculateNextDate = function() {
  const now = new Date();
  let nextDate = new Date(this.nextDate);
  
  switch (this.frequency) {
    case 'weekly':
      nextDate.setDate(now.getDate() + 7);
      break;
    case 'monthly':
      nextDate.setMonth(now.getMonth() + 1);
      break;
    case 'quarterly':
      nextDate.setMonth(now.getMonth() + 3);
      break;
    case 'yearly':
      nextDate.setFullYear(now.getFullYear() + 1);
      break;
    default:
      nextDate.setMonth(now.getMonth() + 1);
  }
  
  return nextDate;
};

// Check if template should be paused (past end date)
recurringInvoiceSchema.methods.shouldPause = function() {
  return this.endDate && new Date() > this.endDate;
};

module.exports = mongoose.model('RecurringInvoice', recurringInvoiceSchema);
