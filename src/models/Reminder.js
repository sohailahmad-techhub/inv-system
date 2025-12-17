const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice'
  },
  type: {
    type: String,
    enum: ['due', 'overdue'],
    required: true
  },
  daysBeforeDue: {
    type: Number,
    default: 0
  },
  template: {
    subject: String,
    message: String
  },
  channels: {
    email: {
      type: Boolean,
      default: true
    },
    sms: {
      type: Boolean,
      default: false
    },
    whatsapp: {
      type: Boolean,
      default: false
    }
  },
  active: {
    type: Boolean,
    default: true
  },
  sentReminders: [{
    notificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NotificationHistory'
    },
    sentAt: Date,
    channel: String
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for performance
reminderSchema.index({ clientId: 1 });
reminderSchema.index({ invoiceId: 1 });
reminderSchema.index({ active: 1, type: 1 });
reminderSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Reminder', reminderSchema);
