const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  expenseId: {
    type: String,
    unique: true,
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    trim: true
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
  category: {
    type: String,
    required: true,
    enum: [
      'office_supplies',
      'software_tools',
      'marketing_advertising',
      'travel_expenses',
      'professional_services',
      'equipment',
      'utilities',
      'rent_lease',
      'insurance',
      'training_education',
      'meals_entertainment',
      'vehicle_fuel',
      'telecommunications',
      'bank_fees',
      'legal_professional',
      'accounting_tax',
      'other'
    ]
  },
  subcategory: {
    type: String,
    trim: true
  },
  vendor: {
    name: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String
    }
  },
  expenseDate: {
    type: Date,
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['credit_card', 'debit_card', 'bank_transfer', 'cash', 'check', 'other'],
    default: 'other'
  },
  receipt: {
    fileName: String,
    fileUrl: String,
    fileType: String,
    uploadedAt: Date
  },
  // Tax information
  taxInfo: {
    isDeductible: { type: Boolean, default: true },
    taxRate: { type: Number, min: 0, max: 100 },
    taxAmount: { type: Number, min: 0 },
    taxCategory: { type: String }
  },
  // Integration tracking
  integrationData: {
    quickbooksId: String,
    xeroId: String,
    freshbooksId: String
  },
  syncStatus: {
    quickbooks: { type: String, enum: ['pending', 'synced', 'failed'], default: 'pending' },
    xero: { type: String, enum: ['pending', 'synced', 'failed'], default: 'pending' },
    freshbooks: { type: String, enum: ['pending', 'synced', 'failed'], default: 'pending' }
  },
  // Approval workflow
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'not_required'],
    default: 'pending'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  rejectionReason: String,
  // Tags and metadata
  tags: [{ type: String, trim: true }],
  project: {
    name: String,
    code: String
  },
  // Recurring expense
  isRecurring: { type: Boolean, default: false },
  recurringPattern: {
    frequency: { type: String, enum: ['weekly', 'monthly', 'quarterly', 'yearly'] },
    nextDueDate: Date,
    endDate: Date
  },
  // Multitenancy
  tenantId: {
    type: String,
    required: true
  },
  // User tracking
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for performance
expenseSchema.index({ expenseId: 1 });
expenseSchema.index({ category: 1 });
expenseSchema.index({ expenseDate: -1 });
expenseSchema.index({ amount: 1 });
expenseSchema.index({ createdBy: 1 });
expenseSchema.index({ tenantId: 1 });
expenseSchema.index({ approvalStatus: 1 });

// Pre-save middleware to generate expense ID
expenseSchema.pre('save', function(next) {
  if (!this.expenseId) {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.expenseId = `EXP-${timestamp}-${random}`;
  }
  next();
});

// Virtual for tax-deductible amount
expenseSchema.virtual('deductibleAmount').get(function() {
  if (this.taxInfo && this.taxInfo.isDeductible) {
    return this.amount - (this.taxInfo.taxAmount || 0);
  }
  return this.amount;
});

// Method to check if expense needs approval
expenseSchema.methods.needsApproval = function() {
  const approvalRequiredAmount = 1000; // Configurable threshold
  return this.amount > approvalRequiredAmount;
};

module.exports = mongoose.model('Expense', expenseSchema);