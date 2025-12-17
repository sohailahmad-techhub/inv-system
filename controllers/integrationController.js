const asyncHandler = require('express-async-handler');
const Integration = require('../models/Integration');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const User = require('../models/User');
const { AuthorizationCode } = require('simple-oauth2');
const axios = require('axios');

// @desc    Get all integrations for a tenant
// @route   GET /api/integrations
// @access  Private
const getIntegrations = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  
  const integrations = await Integration.find({ tenantId })
    .populate('createdBy', 'firstName lastName email')
    .populate('updatedBy', 'firstName lastName email');
  
  res.json({
    success: true,
    data: integrations
  });
});

// @desc    Get integration status
// @route   GET /api/integrations/status
// @access  Private
const getIntegrationStatus = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  
  const integrations = await Integration.find({ tenantId });
  
  const status = integrations.map(integration => ({
    provider: integration.provider,
    status: integration.status,
    lastSyncAt: integration.connectionData.lastSyncAt,
    needsSync: integration.getSyncStatus() === 'needs_sync',
    error: integration.syncStats.lastError
  }));
  
  res.json({
    success: true,
    data: status
  });
});

// @desc    Connect to QuickBooks
// @route   POST /api/integrations/quickbooks/connect
// @access  Private
const connectQuickBooks = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  
  const client = new AuthorizationCode({
    client: {
      id: process.env.QUICKBOOKS_CLIENT_ID,
      secret: process.env.QUICKBOOKS_CLIENT_SECRET
    },
    auth: {
      tokenHost: 'https://oauth.platform.intuit.com',
      authorizePath: '/oauth2/v1/authorize',
      tokenPath: '/oauth2/v1/tokens/bearer'
    }
  });
  
  const authorizationUri = client.authorizeURL({
    redirect_uri: process.env.QUICKBOOKS_REDIRECT_URI,
    scope: 'com.intuit.quickbooks.accounting',
    state: `${tenantId}-${Date.now()}`
  });
  
  res.json({
    success: true,
    data: {
      authUrl: authorizationUri,
      message: 'Redirect to this URL to authorize QuickBooks connection'
    }
  });
});

// @desc    QuickBooks OAuth callback
// @route   GET /api/integrations/quickbooks/callback
// @access  Private
const quickbooksCallback = asyncHandler(async (req, res) => {
  const { code, state, realmId } = req.query;
  
  if (!code || !state || !realmId) {
    res.status(400);
    throw new Error('Missing required OAuth parameters');
  }
  
  const tenantId = state.split('-')[0];
  
  const client = new AuthorizationCode({
    client: {
      id: process.env.QUICKBOOKS_CLIENT_ID,
      secret: process.env.QUICKBOOKS_CLIENT_SECRET
    },
    auth: {
      tokenHost: 'https://oauth.platform.intuit.com',
      authorizePath: '/oauth2/v1/authorize',
      tokenPath: '/oauth2/v1/tokens/bearer'
    }
  });
  
  try {
    const tokenParams = {
      code,
      redirect_uri: process.env.QUICKBOOKS_REDIRECT_URI
    };
    
    const accessToken = await client.getToken(tokenParams);
    
    // Get company info
    const companyInfo = await axios.get(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken.token.access_token}`,
          'Accept': 'application/json'
        }
      }
    );
    
    // Create or update integration
    const integration = await Integration.findOneAndUpdate(
      { tenantId, provider: 'quickbooks' },
      {
        status: 'connected',
        oauthData: {
          accessToken: accessToken.token.access_token,
          refreshToken: accessToken.token.refresh_token,
          tokenType: accessToken.token.token_type,
          expiresAt: new Date(Date.now() + accessToken.token.expires_in * 1000),
          realmId
        },
        connectionData: {
          companyName: companyInfo.data.QueryResponse.CompanyInfo[0].CompanyName,
          country: companyInfo.data.QueryResponse.CompanyInfo[0].Country,
          currency: companyInfo.data.QueryResponse.CompanyInfo[0].Currency,
          connectedAt: new Date(),
          apiVersion: 'v3'
        },
        createdBy: req.user._id
      },
      { upsert: true, new: true }
    );
    
    // Trigger webhook
    await triggerWebhook('integration.connected', { integration, provider: 'quickbooks' });
    
    res.json({
      success: true,
      message: 'QuickBooks connected successfully',
      data: integration
    });
    
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'QuickBooks connection failed',
      error: error.message
    });
  }
});

// @desc    Connect to Xero
// @route   POST /api/integrations/xero/connect
// @access  Private
const connectXero = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  
  const client = new AuthorizationCode({
    client: {
      id: process.env.XERO_CLIENT_ID,
      secret: process.env.XERO_CLIENT_SECRET
    },
    auth: {
      tokenHost: 'https://identity.xero.com',
      authorizePath: '/connect/authorize',
      tokenPath: '/connect/token'
    }
  });
  
  const authorizationUri = client.authorizeURL({
    redirect_uri: process.env.XERO_REDIRECT_URI,
    scope: 'accounting.transactions accounting.contacts',
    state: `${tenantId}-${Date.now()}`
  });
  
  res.json({
    success: true,
    data: {
      authUrl: authorizationUri,
      message: 'Redirect to this URL to authorize Xero connection'
    }
  });
});

// @desc    Xero OAuth callback
// @route   GET /api/integrations/xero/callback
// @access  Private
const xeroCallback = asyncHandler(async (req, res) => {
  const { code, state } = req.query;
  
  if (!code || !state) {
    res.status(400);
    throw new Error('Missing required OAuth parameters');
  }
  
  const tenantId = state.split('-')[0];
  
  const client = new AuthorizationCode({
    client: {
      id: process.env.XERO_CLIENT_ID,
      secret: process.env.XERO_CLIENT_SECRET
    },
    auth: {
      tokenHost: 'https://identity.xero.com',
      authorizePath: '/connect/authorize',
      tokenPath: '/connect/token'
    }
  });
  
  try {
    const tokenParams = {
      code,
      redirect_uri: process.env.XERO_REDIRECT_URI
    };
    
    const accessToken = await client.getToken(tokenParams);
    
    // Get connections to get tenant ID
    const connections = await axios.get('https://api.xero.com/connections', {
      headers: {
        'Authorization': `Bearer ${accessToken.token.access_token}`,
        'Accept': 'application/json'
      }
    });
    
    const organisation = connections.data[0];
    
    // Create or update integration
    const integration = await Integration.findOneAndUpdate(
      { tenantId, provider: 'xero' },
      {
        status: 'connected',
        oauthData: {
          accessToken: accessToken.token.access_token,
          refreshToken: accessToken.token.refresh_token,
          tokenType: accessToken.token.token_type,
          expiresAt: new Date(Date.now() + accessToken.token.expires_in * 1000),
          organisationId: organisation.tenantId
        },
        connectionData: {
          companyName: organisation.tenantName,
          country: organisation.countryCode,
          currency: organisation.baseCurrency,
          connectedAt: new Date(),
          apiVersion: 'v2'
        },
        createdBy: req.user._id
      },
      { upsert: true, new: true }
    );
    
    // Trigger webhook
    await triggerWebhook('integration.connected', { integration, provider: 'xero' });
    
    res.json({
      success: true,
      message: 'Xero connected successfully',
      data: integration
    });
    
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Xero connection failed',
      error: error.message
    });
  }
});

// @desc    Disconnect integration
// @route   DELETE /api/integrations/:provider
// @access  Private
const disconnectIntegration = asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  
  const integration = await Integration.findOne({ tenantId, provider });
  
  if (!integration) {
    res.status(404);
    throw new Error('Integration not found');
  }
  
  // Revoke token if needed
  if (integration.oauthData.accessToken) {
    try {
      // Implement token revocation for each provider
      await revokeToken(provider, integration.oauthData.accessToken);
    } catch (error) {
      console.warn(`Failed to revoke ${provider} token:`, error.message);
    }
  }
  
  integration.status = 'disconnected';
  integration.oauthData = {};
  await integration.save();
  
  // Trigger webhook
  await triggerWebhook('integration.disconnected', { integration, provider });
  
  res.json({
    success: true,
    message: `${provider} disconnected successfully`
  });
});

// @desc    Sync data with integration
// @route   POST /api/integrations/:provider/sync
// @access  Private
const syncIntegration = asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  
  const integration = await Integration.findOne({ tenantId, provider });
  
  if (!integration) {
    res.status(404);
    throw new Error('Integration not found');
  }
  
  if (integration.status !== 'connected') {
    res.status(400);
    throw new Error('Integration not connected');
  }
  
  // Check if token needs refresh
  if (integration.needsRefresh()) {
    await refreshIntegrationToken(integration);
  }
  
  integration.status = 'syncing';
  await integration.save();
  
  try {
    let syncResults = {};
    
    // Sync invoices
    if (integration.syncSettings.syncInvoices) {
      syncResults.invoices = await syncInvoices(integration);
    }
    
    // Sync payments
    if (integration.syncSettings.syncPayments) {
      syncResults.payments = await syncPayments(integration);
    }
    
    // Sync clients
    if (integration.syncSettings.syncClients) {
      syncResults.clients = await syncClients(integration);
    }
    
    // Update integration
    integration.status = 'connected';
    integration.connectionData.lastSyncAt = new Date();
    integration.syncStats.lastSyncStatus = 'success';
    integration.syncStats.lastError = null;
    
    // Update sync statistics
    if (syncResults.invoices) {
      integration.syncStats.totalSynced.invoices += syncResults.invoices.synced || 0;
      integration.syncStats.failedSyncs.invoices += syncResults.invoices.failed || 0;
    }
    if (syncResults.payments) {
      integration.syncStats.totalSynced.payments += syncResults.payments.synced || 0;
      integration.syncStats.failedSyncs.payments += syncResults.payments.failed || 0;
    }
    if (syncResults.clients) {
      integration.syncStats.totalSynced.clients += syncResults.clients.synced || 0;
      integration.syncStats.failedSyncs.clients += syncResults.clients.failed || 0;
    }
    
    await integration.save();
    
    res.json({
      success: true,
      message: 'Sync completed successfully',
      data: syncResults
    });
    
  } catch (error) {
    integration.status = 'connected';
    integration.syncStats.lastSyncStatus = 'failed';
    integration.syncStats.lastError = error.message;
    integration.syncStats.lastErrorAt = new Date();
    await integration.save();
    
    res.status(500).json({
      success: false,
      message: 'Sync failed',
      error: error.message
    });
  }
});

// @desc    Manual sync trigger
// @route   POST /api/integrations/sync
// @access  Private
const manualSync = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  
  const integrations = await Integration.find({ 
    tenantId, 
    status: 'connected',
    'syncSettings.autoSync': true
  });
  
  const syncResults = [];
  
  for (const integration of integrations) {
    try {
      const result = await syncIntegrationWithProvider(integration);
      syncResults.push({ provider: integration.provider, success: true, result });
    } catch (error) {
      syncResults.push({ provider: integration.provider, success: false, error: error.message });
    }
  }
  
  res.json({
    success: true,
    data: syncResults
  });
});

// Helper functions

async function syncInvoices(integration) {
  const { provider, oauthData } = integration;
  
  switch (provider) {
    case 'quickbooks':
      return await syncQuickBooksInvoices(oauthData);
    case 'xero':
      return await syncXeroInvoices(oauthData);
    case 'freshbooks':
      return await syncFreshBooksInvoices(oauthData);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

async function syncQuickBooksInvoices(oauthData) {
  try {
    const response = await axios.get(
      `${process.env.QUICKBOOKS_API_URL}/v3/company/${oauthData.realmId}/query`,
      {
        params: {
          query: "SELECT * FROM Invoice"
        },
        headers: {
          'Authorization': `Bearer ${oauthData.accessToken}`,
          'Accept': 'application/json'
        }
      }
    );
    
    const invoices = response.data.QueryResponse.Invoice || [];
    let synced = 0;
    let failed = 0;
    
    for (const qbInvoice of invoices) {
      try {
        await syncQuickBooksInvoiceToLocal(qbInvoice, integration.tenantId);
        synced++;
      } catch (error) {
        console.error('Failed to sync invoice:', error.message);
        failed++;
      }
    }
    
    return { synced, failed, total: invoices.length };
  } catch (error) {
    throw new Error(`QuickBooks sync failed: ${error.message}`);
  }
}

async function syncQuickBooksInvoiceToLocal(qbInvoice, tenantId) {
  // Implementation to convert QuickBooks invoice to local format
  // This is a simplified version - actual implementation would be more complex
  
  const existingInvoice = await Invoice.findOne({
    'externalIds.quickbooksId': qbInvoice.Id,
    tenantId
  });
  
  if (existingInvoice) return; // Skip if already synced
  
  // Create local invoice from QuickBooks data
  // This would require mapping QuickBooks fields to local schema
  console.log(`Syncing QuickBooks invoice ${qbInvoice.Id}`);
}

async function syncXeroInvoices(oauthData) {
  try {
    const response = await axios.get(
      'https://api.xero.com/api.xro/2.0/Invoices',
      {
        headers: {
          'Authorization': `Bearer ${oauthData.accessToken}`,
          'Xero-tenant-id': oauthData.organisationId,
          'Accept': 'application/json'
        }
      }
    );
    
    const invoices = response.data.Invoices || [];
    let synced = 0;
    let failed = 0;
    
    for (const xeroInvoice of invoices) {
      try {
        await syncXeroInvoiceToLocal(xeroInvoice, integration.tenantId);
        synced++;
      } catch (error) {
        console.error('Failed to sync invoice:', error.message);
        failed++;
      }
    }
    
    return { synced, failed, total: invoices.length };
  } catch (error) {
    throw new Error(`Xero sync failed: ${error.message}`);
  }
}

async function syncXeroInvoiceToLocal(xeroInvoice, tenantId) {
  // Implementation to convert Xero invoice to local format
  console.log(`Syncing Xero invoice ${xeroInvoice.InvoiceID}`);
}

async function syncPayments(integration) {
  // Similar implementation for payments
  return { synced: 0, failed: 0, total: 0 };
}

async function syncClients(integration) {
  // Similar implementation for clients
  return { synced: 0, failed: 0, total: 0 };
}

async function refreshIntegrationToken(integration) {
  const client = getOAuthClient(integration.provider);
  
  const tokenParams = {
    refresh_token: integration.oauthData.refreshToken
  };
  
  const accessToken = await client.createToken(tokenParams);
  const newToken = await accessToken.refresh();
  
  integration.oauthData.accessToken = newToken.token.access_token;
  integration.oauthData.refreshToken = newToken.token.refresh_token;
  integration.oauthData.expiresAt = new Date(Date.now() + newToken.token.expires_in * 1000);
  
  await integration.save();
}

function getOAuthClient(provider) {
  switch (provider) {
    case 'quickbooks':
      return new AuthorizationCode({
        client: {
          id: process.env.QUICKBOOKS_CLIENT_ID,
          secret: process.env.QUICKBOOKS_CLIENT_SECRET
        },
        auth: {
          tokenHost: 'https://oauth.platform.intuit.com',
          tokenPath: '/oauth2/v1/tokens/bearer'
        }
      });
    case 'xero':
      return new AuthorizationCode({
        client: {
          id: process.env.XERO_CLIENT_ID,
          secret: process.env.XERO_CLIENT_SECRET
        },
        auth: {
          tokenHost: 'https://identity.xero.com',
          tokenPath: '/connect/token'
        }
      });
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

async function revokeToken(provider, token) {
  // Implementation for token revocation
  console.log(`Revoking ${provider} token`);
}

async function syncIntegrationWithProvider(integration) {
  // Wrapper function to sync a single integration
  return await syncInvoices(integration);
}

// Helper function to trigger webhooks
async function triggerWebhook(event, data) {
  console.log(`Triggering webhook for event: ${event}`);
  // Implementation would go here
}

module.exports = {
  getIntegrations,
  getIntegrationStatus,
  connectQuickBooks,
  quickbooksCallback,
  connectXero,
  xeroCallback,
  disconnectIntegration,
  syncIntegration,
  manualSync
};