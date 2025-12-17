const asyncHandler = require('express-async-handler');
const Webhook = require('../models/Webhook');
const crypto = require('crypto');

// @desc    Get all webhooks for a tenant
// @route   GET /api/webhooks
// @access  Private
const getWebhooks = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  
  const query = { tenantId };
  
  // Apply filters
  if (req.query.status) {
    query.status = req.query.status;
  }
  if (req.query.event) {
    query.events = { $in: [req.query.event] };
  }
  
  const webhooks = await Webhook.find(query)
    .populate('createdBy', 'firstName lastName email')
    .populate('updatedBy', 'firstName lastName email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
  
  const total = await Webhook.countDocuments(query);
  
  res.json({
    success: true,
    data: webhooks,
    pagination: {
      current: page,
      pages: Math.ceil(total / limit),
      total
    }
  });
});

// @desc    Get single webhook
// @route   GET /api/webhooks/:id
// @access  Private
const getWebhook = asyncHandler(async (req, res) => {
  const webhook = await Webhook.findById(req.params.id)
    .populate('createdBy', 'firstName lastName email')
    .populate('updatedBy', 'firstName lastName email');
  
  if (!webhook) {
    res.status(404);
    throw new Error('Webhook not found');
  }
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (webhook.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  res.json({
    success: true,
    data: webhook
  });
});

// @desc    Create new webhook
// @route   POST /api/webhooks
// @access  Private
const createWebhook = asyncHandler(async (req, res) => {
  const {
    name,
    url,
    events,
    retryConfig,
    rateLimit,
    filters,
    isTestMode
  } = req.body;
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  
  // Generate secret for webhook verification
  const secret = crypto.randomBytes(32).toString('hex');
  
  const webhook = await Webhook.create({
    name,
    url,
    events,
    secret,
    retryConfig: retryConfig || {},
    rateLimit: rateLimit || {},
    filters: filters || {},
    isTestMode: isTestMode || false,
    createdBy: req.user._id,
    tenantId
  });
  
  const populatedWebhook = await Webhook.findById(webhook._id)
    .populate('createdBy', 'firstName lastName email');
  
  res.status(201).json({
    success: true,
    data: populatedWebhook
  });
});

// @desc    Update webhook
// @route   PUT /api/webhooks/:id
// @access  Private
const updateWebhook = asyncHandler(async (req, res) => {
  let webhook = await Webhook.findById(req.params.id);
  
  if (!webhook) {
    res.status(404);
    throw new Error('Webhook not found');
  }
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (webhook.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  const {
    name,
    url,
    events,
    status,
    retryConfig,
    rateLimit,
    filters
  } = req.body;
  
  if (name !== undefined) webhook.name = name;
  if (url !== undefined) webhook.url = url;
  if (events !== undefined) webhook.events = events;
  if (status !== undefined) webhook.status = status;
  if (retryConfig !== undefined) webhook.retryConfig = retryConfig;
  if (rateLimit !== undefined) webhook.rateLimit = rateLimit;
  if (filters !== undefined) webhook.filters = filters;
  
  webhook.updatedBy = req.user._id;
  
  await webhook.save();
  
  const updatedWebhook = await Webhook.findById(webhook._id)
    .populate('createdBy', 'firstName lastName email')
    .populate('updatedBy', 'firstName lastName email');
  
  res.json({
    success: true,
    data: updatedWebhook
  });
});

// @desc    Delete webhook
// @route   DELETE /api/webhooks/:id
// @access  Private
const deleteWebhook = asyncHandler(async (req, res) => {
  const webhook = await Webhook.findById(req.params.id);
  
  if (!webhook) {
    res.status(404);
    throw new Error('Webhook not found');
  }
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (webhook.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  await Webhook.findByIdAndDelete(req.params.id);
  
  res.json({
    success: true,
    message: 'Webhook deleted'
  });
});

// @desc    Test webhook
// @route   POST /api/webhooks/:id/test
// @access  Private
const testWebhook = asyncHandler(async (req, res) => {
  const webhook = await Webhook.findById(req.params.id);
  
  if (!webhook) {
    res.status(404);
    throw new Error('Webhook not found');
  }
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (webhook.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  const testPayload = {
    event: 'webhook.test',
    data: {
      message: 'This is a test webhook',
      timestamp: new Date().toISOString(),
      webhookId: webhook.webhookId
    },
    tenantId
  };
  
  try {
    const result = await sendWebhook(webhook, testPayload);
    
    webhook.lastTested = new Date();
    await webhook.save();
    
    res.json({
      success: true,
      message: 'Webhook test completed',
      data: {
        status: result.status,
        responseCode: result.responseCode,
        responseTime: result.responseTime
      }
    });
    
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Webhook test failed',
      error: error.message
    });
  }
});

// @desc    Get webhook deliveries
// @route   GET /api/webhooks/:id/deliveries
// @access  Private
const getWebhookDeliveries = asyncHandler(async (req, res) => {
  const webhook = await Webhook.findById(req.params.id);
  
  if (!webhook) {
    res.status(404);
    throw new Error('Webhook not found');
  }
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (webhook.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  const limit = parseInt(req.query.limit) || 20;
  const deliveries = webhook.deliveries.slice(-limit);
  
  res.json({
    success: true,
    data: deliveries
  });
});

// @desc    Retry failed webhook delivery
// @route   POST /api/webhooks/:id/deliveries/:deliveryId/retry
// @access  Private
const retryWebhookDelivery = asyncHandler(async (req, res) => {
  const webhook = await Webhook.findById(req.params.id);
  
  if (!webhook) {
    res.status(404);
    throw new Error('Webhook not found');
  }
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (webhook.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  const delivery = webhook.deliveries.id(req.params.deliveryId);
  
  if (!delivery) {
    res.status(404);
    throw new Error('Delivery not found');
  }
  
  if (delivery.status === 'success') {
    res.status(400);
    throw new Error('Cannot retry successful delivery');
  }
  
  try {
    const result = await sendWebhook(webhook, delivery.payload);
    
    // Update delivery record
    delivery.status = result.status;
    delivery.responseCode = result.responseCode;
    delivery.responseBody = result.responseBody;
    delivery.attempts += 1;
    delivery.completedAt = new Date();
    
    webhook.recordDelivery(delivery.eventType, result.status, result.responseCode, 
                         result.responseBody, result.error, delivery.attempts);
    
    await webhook.save();
    
    res.json({
      success: true,
      message: 'Webhook delivery retried',
      data: delivery
    });
    
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Webhook retry failed',
      error: error.message
    });
  }
});

// @desc    Get webhook events
// @route   GET /api/webhooks/events
// @access  Private
const getWebhookEvents = asyncHandler(async (req, res) => {
  const events = [
    { value: 'invoice.created', label: 'Invoice Created' },
    { value: 'invoice.sent', label: 'Invoice Sent' },
    { value: 'invoice.viewed', label: 'Invoice Viewed' },
    { value: 'invoice.paid', label: 'Invoice Paid' },
    { value: 'invoice.overdue', label: 'Invoice Overdue' },
    { value: 'invoice.cancelled', label: 'Invoice Cancelled' },
    { value: 'payment.received', label: 'Payment Received' },
    { value: 'payment.failed', label: 'Payment Failed' },
    { value: 'expense.created', label: 'Expense Created' },
    { value: 'client.created', label: 'Client Created' },
    { value: 'user.created', label: 'User Created' },
    { value: 'integration.connected', label: 'Integration Connected' },
    { value: 'integration.disconnected', label: 'Integration Disconnected' }
  ];
  
  res.json({
    success: true,
    data: events
  });
});

// Helper function to send webhook
async function sendWebhook(webhook, payload) {
  const axios = require('axios');
  
  const startTime = Date.now();
  
  // Check rate limits
  const rateLimit = webhook.checkRateLimit();
  if (!rateLimit.canSend) {
    throw new Error('Rate limit exceeded');
  }
  
  // Generate signature
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', webhook.secret)
    .update(timestamp + body)
    .digest('hex');
  
  try {
    const response = await axios.post(webhook.url, payload, {
      timeout: 10000, // 10 second timeout
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Event': payload.event,
        'X-Webhook-Timestamp': timestamp,
        'X-Webhook-Signature': `v1=${signature}`,
        'User-Agent': 'InvoiceSystem-Webhook/1.0'
      }
    });
    
    const responseTime = Date.now() - startTime;
    
    // Increment rate limit
    webhook.incrementRateLimit();
    
    return {
      status: 'success',
      responseCode: response.status,
      responseTime,
      responseBody: response.data
    };
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    // Increment rate limit
    webhook.incrementRateLimit();
    
    return {
      status: 'failed',
      responseCode: error.response?.status || 0,
      responseTime,
      error: error.message
    };
  }
}

// Main webhook delivery function
async function triggerWebhookEvent(event, data, tenantId) {
  const webhooks = await Webhook.find({
    tenantId,
    events: { $in: [event] },
    status: 'active'
  });
  
  const deliveryPromises = webhooks.map(async (webhook) => {
    try {
      // Check if event passes filters
      if (!passesFilters(webhook.filters, data)) {
        return { webhookId: webhook._id, skipped: true, reason: 'filter_mismatch' };
      }
      
      const payload = {
        event,
        data,
        timestamp: new Date().toISOString(),
        webhookId: webhook.webhookId,
        tenantId
      };
      
      const result = await sendWebhook(webhook, payload);
      
      // Record delivery
      webhook.recordDelivery(event, result.status, result.responseCode, 
                           result.responseBody, result.error, 1);
      await webhook.save();
      
      return { 
        webhookId: webhook._id, 
        success: result.status === 'success',
        responseCode: result.responseCode 
      };
      
    } catch (error) {
      console.error(`Webhook delivery failed for ${webhook._id}:`, error);
      
      // Record failed delivery
      webhook.recordDelivery(event, 'failed', 0, null, error.message, 1);
      await webhook.save();
      
      return { 
        webhookId: webhook._id, 
        success: false, 
        error: error.message 
      };
    }
  });
  
  const results = await Promise.allSettled(deliveryPromises);
  
  return {
    total: webhooks.length,
    successful: results.filter(r => r.value?.success).length,
    failed: results.filter(r => !r.value?.success && !r.value?.skipped).length,
    skipped: results.filter(r => r.value?.skipped).length,
    details: results.map(r => r.value)
  };
}

// Helper function to check if data passes webhook filters
function passesFilters(filters, data) {
  if (!filters) return true;
  
  // Check client IDs filter
  if (filters.clientIds && filters.clientIds.length > 0) {
    const clientId = data.clientId || data.invoiceId?.clientId;
    if (clientId && !filters.clientIds.includes(clientId.toString())) {
      return false;
    }
  }
  
  // Check invoice status filter
  if (filters.invoiceStatuses && filters.invoiceStatuses.length > 0) {
    const status = data.status || data.invoiceId?.status;
    if (status && !filters.invoiceStatuses.includes(status)) {
      return false;
    }
  }
  
  // Check amount range filter
  if (filters.amountRange) {
    const amount = data.amount || data.invoiceId?.total;
    if (amount) {
      if (filters.amountRange.min && amount < filters.amountRange.min) return false;
      if (filters.amountRange.max && amount > filters.amountRange.max) return false;
    }
  }
  
  return true;
}

module.exports = {
  getWebhooks,
  getWebhook,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  getWebhookDeliveries,
  retryWebhookDelivery,
  getWebhookEvents,
  triggerWebhookEvent,
  sendWebhook
};