const cron = require('node-cron');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Webhook = require('../models/Webhook');
const { triggerWebhookEvent } = require('./webhookController');

// Run every day at 9 AM
cron.schedule('0 9 * * *', async () => {
  console.log('Running daily invoice status checks...');
  await updateOverdueInvoices();
  await sendPaymentReminders();
  await processRecurringExpenses();
});

// Run every hour
cron.schedule('0 * * * *', async () => {
  console.log('Running hourly payment predictions...');
  await updatePaymentPredictions();
  await refreshIntegrationTokens();
});

// Run every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  console.log('Running webhook delivery retries...');
  await retryFailedWebhooks();
});

// Update overdue invoices
async function updateOverdueInvoices() {
  try {
    const now = new Date();
    
    // Find invoices that are now overdue
    const overdueInvoices = await Invoice.find({
      status: 'sent',
      dueDate: { $lt: now },
      overdueNotified: { $ne: true }
    }).populate('clientId', 'firstName lastName email');
    
    for (const invoice of overdueInvoices) {
      // Update status
      invoice.status = 'overdue';
      invoice.overdueNotified = true;
      await invoice.save();
      
      // Trigger webhook
      await triggerWebhookEvent('invoice.overdue', {
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        clientId: invoice.clientId._id,
        clientName: `${invoice.clientId.firstName} ${invoice.clientId.lastName}`,
        amount: invoice.total,
        dueDate: invoice.dueDate,
        daysOverdue: Math.ceil((now - invoice.dueDate) / (1000 * 60 * 60 * 24))
      }, invoice.tenantId);
      
      console.log(`Invoice ${invoice.invoiceNumber} marked as overdue`);
    }
    
    console.log(`Updated ${overdueInvoices.length} overdue invoices`);
    
  } catch (error) {
    console.error('Error updating overdue invoices:', error);
  }
}

// Send payment reminders
async function sendPaymentReminders() {
  try {
    const now = new Date();
    const reminderDates = [
      new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days before due
      new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000), // 1 day before due
      new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)  // 3 days overdue
    ];
    
    for (const reminderDate of reminderDates) {
      const startOfDay = new Date(reminderDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(reminderDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      // Find invoices due on this date
      const invoicesToRemind = await Invoice.find({
        status: 'sent',
        dueDate: {
          $gte: startOfDay,
          $lte: endOfDay
        },
        reminderSent: { $ne: true }
      }).populate('clientId', 'firstName lastName email');
      
      for (const invoice of invoicesToRemind) {
        // Here you would send actual email/SMS reminders
        console.log(`Sending reminder for invoice ${invoice.invoiceNumber} to ${invoice.clientId.email}`);
        
        // Mark reminder as sent
        invoice.reminderSent = true;
        await invoice.save();
        
        // Trigger webhook for reminder sent
        await triggerWebhookEvent('invoice.reminder', {
          invoiceId: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          clientId: invoice.clientId._id,
          clientName: `${invoice.clientId.firstName} ${invoice.clientId.lastName}`,
          amount: invoice.total,
          dueDate: invoice.dueDate
        }, invoice.tenantId);
      }
    }
    
  } catch (error) {
    console.error('Error sending payment reminders:', error);
  }
}

// Process recurring expenses
async function processRecurringExpenses() {
  try {
    const now = new Date();
    
    const recurringExpenses = await require('../models/Expense').find({
      isRecurring: true,
      'recurringPattern.nextDueDate': { $lte: now }
    });
    
    for (const expense of recurringExpenses) {
      // Create a new expense instance
      const newExpense = expense.toObject();
      delete newExpense._id;
      delete newExpense.expenseId;
      newExpense.expenseDate = now;
      
      const Expense = require('../models/Expense');
      await Expense.create(newExpense);
      
      // Calculate next due date
      const nextDueDate = calculateNextRecurringDate(
        expense.recurringPattern.frequency,
        expense.recurringPattern.nextDueDate
      );
      
      expense.recurringPattern.nextDueDate = nextDueDate;
      await expense.save();
      
      console.log(`Created recurring expense for ${expense.title}`);
    }
    
  } catch (error) {
    console.error('Error processing recurring expenses:', error);
  }
}

// Update payment predictions
async function updatePaymentPredictions() {
  try {
    // Find invoices that need prediction updates (older than 24 hours)
    const invoicesToUpdate = await Invoice.find({
      'paymentPrediction.lastCalculated': {
        $lt: new Date(Date.now() - 24 * 60 * 60 * 1000)
      },
      status: { $in: ['sent', 'viewed'] }
    }).limit(50); // Process in batches
    
    for (const invoice of invoicesToUpdate) {
      await recalculatePaymentPrediction(invoice._id);
    }
    
    console.log(`Updated payment predictions for ${invoicesToUpdate.length} invoices`);
    
  } catch (error) {
    console.error('Error updating payment predictions:', error);
  }
}

// Refresh integration tokens
async function refreshIntegrationTokens() {
  try {
    const Integration = require('../models/Integration');
    
    const integrations = await Integration.find({
      status: 'connected',
      'oauthData.expiresAt': {
        $lt: new Date(Date.now() + 60 * 60 * 1000) // Expires within 1 hour
      }
    });
    
    for (const integration of integrations) {
      // Refresh tokens logic would go here
      console.log(`Refreshing token for ${integration.provider} integration`);
    }
    
  } catch (error) {
    console.error('Error refreshing integration tokens:', error);
  }
}

// Retry failed webhooks
async function retryFailedWebhooks() {
  try {
    const failedDeliveries = await Webhook.aggregate([
      { $unwind: '$deliveries' },
      { $match: { 
        'deliveries.status': 'failed',
        'deliveries.attempts': { $lt: 3 }
      }},
      { $sort: { 'deliveries.sentAt': 1 } },
      { $limit: 10 }
    ]);
    
    for (const deliveryData of failedDeliveries) {
      const webhook = await Webhook.findById(deliveryData._id);
      const delivery = webhook.deliveries.id(deliveryData.deliveries._id);
      
      if (delivery.attempts < webhook.retryConfig.maxRetries) {
        // Retry the webhook delivery
        try {
          const axios = require('axios');
          const crypto = require('crypto');
          
          const timestamp = Math.floor(Date.now() / 1000).toString();
          const body = JSON.stringify(delivery.payload);
          const signature = crypto
            .createHmac('sha256', webhook.secret)
            .update(timestamp + body)
            .digest('hex');
          
          const response = await axios.post(webhook.url, delivery.payload, {
            timeout: 10000,
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Event': delivery.eventType,
              'X-Webhook-Timestamp': timestamp,
              'X-Webhook-Signature': `v1=${signature}`,
              'User-Agent': 'InvoiceSystem-Webhook/1.0'
            }
          });
          
          // Update delivery as successful
          delivery.status = 'success';
          delivery.responseCode = response.status;
          delivery.responseBody = response.data;
          delivery.attempts += 1;
          delivery.completedAt = new Date();
          
          await webhook.save();
          
          console.log(`Successfully retried webhook ${webhook.webhookId}`);
          
        } catch (retryError) {
          // Update delivery as failed again
          delivery.attempts += 1;
          delivery.error = retryError.message;
          
          if (delivery.attempts >= webhook.retryConfig.maxRetries) {
            delivery.completedAt = new Date();
          }
          
          await webhook.save();
        }
      }
    }
    
  } catch (error) {
    console.error('Error retrying failed webhooks:', error);
  }
}

// Helper function to calculate next recurring date
function calculateNextRecurringDate(frequency, currentDate) {
  const nextDate = new Date(currentDate);
  
  switch (frequency) {
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case 'quarterly':
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;
    case 'yearly':
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
  }
  
  return nextDate;
}

// Helper function to recalculate payment prediction
async function recalculatePaymentPrediction(invoiceId) {
  const invoice = await Invoice.findById(invoiceId).populate('clientId');
  
  if (!invoice) return;
  
  // Get client payment history
  const clientPayments = await Payment.aggregate([
    { $match: { clientId: invoice.clientId._id } },
    { $group: { 
      _id: null,
      avgPaymentTime: { $avg: '$paymentDate' },
      totalPayments: { $sum: 1 },
      onTimePayments: {
        $sum: {
          $cond: [
            { $lte: ['$paymentDate', invoice.dueDate] },
            1,
            0
          ]
        }
      }
    }}
  ]);
  
  let likelihood = 0.7; // Base probability
  let predictedDate = new Date(invoice.dueDate);
  
  if (clientPayments.length > 0) {
    const history = clientPayments[0];
    const onTimeRate = history.onTimePayments / history.totalPayments;
    
    likelihood = onTimeRate * 0.8 + 0.2;
    
    const daysFromIssue = (new Date(history.avgPaymentTime) - new Date(invoice.issueDate)) / (1000 * 60 * 60 * 24);
    predictedDate = new Date(new Date(invoice.issueDate).getTime() + daysFromIssue * 24 * 60 * 60 * 1000);
  }
  
  // Adjust based on invoice amount
  if (invoice.total < 100) likelihood += 0.1;
  else if (invoice.total > 10000) likelihood -= 0.2;
  
  const daysUntilDue = (invoice.dueDate - new Date()) / (1000 * 60 * 60 * 24);
  if (daysUntilDue > 30) likelihood -= 0.1;
  else if (daysUntilDue < 7) likelihood += 0.1;
  
  likelihood = Math.max(0, Math.min(1, likelihood));
  
  invoice.paymentPrediction = {
    likelihood,
    predictedDate,
    confidence: 0.8,
    lastCalculated: new Date()
  };
  
  await invoice.save();
}

module.exports = {
  updateOverdueInvoices,
  sendPaymentReminders,
  processRecurringExpenses,
  updatePaymentPredictions,
  retryFailedWebhooks
};