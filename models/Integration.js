const mongoose = require('mongoose');

const integrationSchema = new mongoose.Schema({
  integrationId: {
    type: String,
    unique: true,
    required: true
  },
  tenantId: {
    type: String,
    required: true
  },
  provider: {
    type: String,
    required: true,
    enum: ['quickbooks', 'xero', 'freshbooks']
  },
  status: {
    type: String,
    enum: ['disconnected', 'connected', 'error', 'syncing'],
    default: 'disconnected'
  },
  // OAuth data
  oauthData: {
    accessToken: String,
    refreshToken: String,
    tokenType: String,
    expiresAt: Date,
    scope: [String],
    realmId: String, // QuickBooks specific
    organisationId: String // Xero specific
  },
  // Connection metadata
  connectionData: {
    companyName: String,
    country: String,
    currency: String,
    connectedAt: Date,
    lastSyncAt: Date,
    apiVersion: String
  },
  // Sync settings
  syncSettings: {
    autoSync: { type: Boolean, default: false },
    syncInvoices: { type: Boolean, default: true },
    syncPayments: { type: Boolean, default: true },
    syncClients: { type: Boolean, default: true },
    syncFrequency: { type: String, enum: ['realtime', 'hourly', 'daily'], default: 'daily' },
    conflictResolution: { type: String, enum: ['local_wins', 'remote_wins', 'manual'], default: 'manual' }
  },
  // Sync statistics
  syncStats: {
    lastSyncStatus: String,
    totalSynced: {
      invoices: { type: Number, default: 0 },
      payments: { type: Number, default: 0 },
      clients: { type: Number, default: 0 }
    },
    failedSyncs: {
      invoices: { type: Number, default: 0 },
      payments: { type: Number, default: 0 },
      clients: { type: Number, default: 0 }
    },
    lastError: String,
    lastErrorAt: Date
  },
  // Webhook configuration
  webhookUrl: String,
  webhookEvents: [{
    event: String,
    enabled: { type: Boolean, default: true }
  }],
  // Rate limiting and API usage
  apiUsage: {
    callsToday: { type: Number, default: 0 },
    callsThisMonth: { type: Number, default: 0 },
    lastResetDate: { type: Date, default: Date.now },
    rateLimit: { type: Number, default: 100 }, // API calls per minute
    throttled: { type: Boolean, default: false }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
integrationSchema.index({ tenantId: 1, provider: 1 }, { unique: true });
integrationSchema.index({ status: 1 });
integrationSchema.index({ 'oauthData.expiresAt': 1 });

// Pre-save middleware to generate integration ID
integrationSchema.pre('save', function(next) {
  if (!this.integrationId) {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.integrationId = `INT-${this.provider.toUpperCase()}-${timestamp}-${random}`;
  }
  next();
});

// Method to check if token needs refresh
integrationSchema.methods.needsRefresh = function() {
  if (!this.oauthData.expiresAt) return false;
  return new Date() >= this.oauthData.expiresAt;
};

// Method to get sync status
integrationSchema.methods.getSyncStatus = function() {
  if (this.status === 'connected' && this.syncSettings.autoSync) {
    const lastSync = this.connectionData.lastSyncAt;
    const now = new Date();
    const hoursSinceLastSync = (now - lastSync) / (1000 * 60 * 60);
    
    switch (this.syncSettings.syncFrequency) {
      case 'realtime':
        return hoursSinceLastSync > 1 ? 'needs_sync' : 'synced';
      case 'hourly':
        return hoursSinceLastSync > 1 ? 'needs_sync' : 'synced';
      case 'daily':
        return hoursSinceLastSync > 24 ? 'needs_sync' : 'synced';
      default:
        return 'unknown';
    }
  }
  return 'disabled';
};

module.exports = mongoose.model('Integration', integrationSchema);