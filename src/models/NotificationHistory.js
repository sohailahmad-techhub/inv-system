const mongoose = require('mongoose');

const notificationHistorySchema = new mongoose.Schema({
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  reminderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reminder'
  },
  type: {
    type: String,
    enum: ['invoice_reminder', 'payment_reminder', 'overdue_notice', 'recurring_invoice_created'],
    required: true
  },
  channel: {
    type: String,
    enum: ['email', 'sms', 'whatsapp'],
    required: true
  },
  recipient: {
    type: String,
    required: true
  },
  subject: String,
  message: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'failed', 'bounced'],
    default: 'pending'
  },
  sentAt: Date,
  deliveredAt: Date,
  failedAt: Date,
  errorMessage: String,
  retryCount: {
    type: Number,
    default: 0
  },
  maxRetries: {
    type: Number,
    default: parseInt(process.env.MAX_RETRIES) || 3
  },
  templateId: String,
  metadata: {
    messageId: String,
    providerResponse: mongoose.Schema.Types.Mixed,
    cost: Number
  }
}, {
  timestamps: true
});

// Indexes for performance and deduplication
notificationHistorySchema.index({ 
  invoiceId: 1, 
  type: 1, 
  channel: 1,
  sentAt: -1 
});
notificationHistorySchema.index({ status: 1, retryCount: 1 });
notificationHistorySchema.index({ clientId: 1, createdAt: -1 });
notificationHistorySchema.index({ sentAt: -1 });

// Prevent duplicate notifications
notificationHistorySchema.index({ 
  invoiceId: 1, 
  type: 1, 
  channel: 1, 
  sentAt: 1 
}, { 
  unique: true,
  partialFilterExpression: { 
    status: { $in: ['sent', 'delivered'] } 
  }
});

// Check if notification should be retried
notificationHistorySchema.methods.shouldRetry = function() {
  return this.status === 'failed' && 
         this.retryCount < this.maxRetries && 
         (!this.failedAt || (Date.now() - this.failedAt.getTime()) > parseInt(process.env.RETRY_DELAY) || 5000);
};

// Mark as sent
notificationHistorySchema.methods.markAsSent = function(messageId = null) {
  this.status = 'sent';
  this.sentAt = new Date();
  this.metadata = this.metadata || {};
  if (messageId) {
    this.metadata.messageId = messageId;
  }
};

// Mark as delivered
notificationHistorySchema.methods.markAsDelivered = function() {
  this.status = 'delivered';
  this.deliveredAt = new Date();
};

// Mark as failed
notificationHistorySchema.methods.markAsFailed = function(errorMessage) {
  this.status = 'failed';
  this.failedAt = new Date();
  this.errorMessage = errorMessage;
  this.retryCount = (this.retryCount || 0) + 1;
};

module.exports = mongoose.model('NotificationHistory', notificationHistorySchema);
