const mongoose = require('mongoose');

const webhookSchema = new mongoose.Schema({
  webhookId: {
    type: String,
    unique: true,
    required: true
  },
  tenantId: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  url: {
    type: String,
    required: true,
    trim: true
  },
  events: [{
    type: String,
    enum: [
      'invoice.created',
      'invoice.sent',
      'invoice.viewed',
      'invoice.paid',
      'invoice.overdue',
      'invoice.cancelled',
      'payment.received',
      'payment.failed',
      'expense.created',
      'client.created',
      'user.created',
      'integration.connected',
      'integration.disconnected'
    ]
  }],
  status: {
    type: String,
    enum: ['active', 'inactive', 'paused', 'failed'],
    default: 'active'
  },
  // Security
  secret: {
    type: String,
    required: true
  },
  // Retry configuration
  retryConfig: {
    maxRetries: { type: Number, default: 3 },
    retryDelay: { type: Number, default: 1000 }, // milliseconds
    backoffMultiplier: { type: Number, default: 2 }
  },
  // Delivery history
  deliveries: [{
    eventType: String,
    payload: mongoose.Schema.Types.Mixed,
    status: { type: String, enum: ['success', 'failed', 'timeout'] },
    responseCode: Number,
    responseBody: String,
    attempts: { type: Number, default: 1 },
    sentAt: { type: Date, default: Date.now },
    completedAt: Date,
    error: String
  }],
  // Statistics
  stats: {
    totalDelivered: { type: Number, default: 0 },
    totalFailed: { type: Number, default: 0 },
    lastDeliveredAt: Date,
    lastFailedAt: Date,
    successRate: { type: Number, default: 0 }
  },
  // Rate limiting
  rateLimit: {
    requestsPerMinute: { type: Number, default: 60 },
    requestsPerHour: { type: Number, default: 1000 },
    currentRate: {
      minute: { type: Number, default: 0 },
      hour: { type: Number, default: 0 },
      lastReset: { type: Date, default: Date.now }
    }
  },
  // Filter conditions
  filters: {
    clientIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    invoiceStatuses: [String],
    amountRange: {
      min: Number,
      max: Number
    },
    customConditions: mongoose.Schema.Types.Mixed
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastTested: Date,
  lastError: String,
  isTestMode: { type: Boolean, default: false }
}, {
  timestamps: true
});

// Indexes
webhookSchema.index({ tenantId: 1 });
webhookSchema.index({ status: 1 });
webhookSchema.index({ events: 1 });

// Pre-save middleware to generate webhook ID
webhookSchema.pre('save', function(next) {
  if (!this.webhookId) {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.webhookId = `WH-${timestamp}-${random}`;
  }
  next();
});

// Method to update delivery statistics
webhookSchema.methods.recordDelivery = function(eventType, status, responseCode, responseBody, error, attempts) {
  this.deliveries.push({
    eventType,
    status,
    responseCode,
    responseBody,
    error,
    attempts: attempts || 1,
    completedAt: new Date()
  });
  
  // Keep only last 100 deliveries to prevent document size issues
  if (this.deliveries.length > 100) {
    this.deliveries = this.deliveries.slice(-100);
  }
  
  // Update statistics
  if (status === 'success') {
    this.stats.totalDelivered++;
    this.stats.lastDeliveredAt = new Date();
  } else {
    this.stats.totalFailed++;
    this.stats.lastFailedAt = new Date();
  }
  
  // Calculate success rate
  const total = this.stats.totalDelivered + this.stats.totalFailed;
  this.stats.successRate = total > 0 ? this.stats.totalDelivered / total : 0;
  
  // Update status based on failures
  if (this.stats.successRate < 0.5 && total > 10) {
    this.status = 'failed';
  } else if (this.stats.successRate < 0.8 && total > 5) {
    this.status = 'paused';
  }
};

// Method to check rate limits
webhookSchema.methods.checkRateLimit = function() {
  const now = new Date();
  const minuteWindow = new Date(now.getTime() - 60000);
  const hourWindow = new Date(now.getTime() - 3600000);
  
  // Reset counters if needed
  if (now.getMinutes() !== this.rateLimit.currentRate.lastReset.getMinutes()) {
    this.rateLimit.currentRate.minute = 0;
    this.rateLimit.currentRate.lastReset = now;
  }
  
  if (now.getHours() !== this.rateLimit.currentRate.lastReset.getHours()) {
    this.rateLimit.currentRate.hour = 0;
    this.rateLimit.currentRate.lastReset = now;
  }
  
  return {
    canSend: this.rateLimit.currentRate.minute < this.rateLimit.requestsPerMinute &&
             this.rateLimit.currentRate.hour < this.rateLimit.requestsPerHour,
    currentRates: {
      minute: this.rateLimit.currentRate.minute,
      hour: this.rateLimit.currentRate.hour
    }
  };
};

// Method to increment rate limit counters
webhookSchema.methods.incrementRateLimit = function() {
  this.rateLimit.currentRate.minute++;
  this.rateLimit.currentRate.hour++;
};

module.exports = mongoose.model('Webhook', webhookSchema);