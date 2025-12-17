const Queue = require('bull');
const winston = require('winston');
const path = require('path');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(__dirname, '../../logs/queue.log') }),
    new winston.transports.Console()
  ]
});

// Redis configuration
const redisConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: process.env.REDIS_DB || 0
  }
};

// Create notification queue
const notificationQueue = new Queue('notification processing', process.env.REDIS_URL || 'redis://localhost:6379', redisConfig);

// Create recurring invoice queue
const recurringInvoiceQueue = new Queue('recurring invoice generation', process.env.REDIS_URL || 'redis://localhost:6379', redisConfig);

// Create reminder queue
const reminderQueue = new Queue('reminder processing', process.env.REDIS_URL || 'redis://localhost:6379', redisConfig);

// Queue processors
notificationQueue.process('send-invoice-reminder', async (job) => {
  const { invoiceId, clientId, reminderType, channels, reminderId } = job.data;
  
  try {
    const Invoice = require('../models/Invoice');
    const Client = require('../models/Client');
    const notificationService = require('../services/notificationService');
    
    const invoice = await Invoice.findById(invoiceId);
    const client = await Client.findById(clientId);
    
    if (!invoice || !client) {
      throw new Error('Invoice or client not found');
    }
    
    const result = await notificationService.sendInvoiceReminder(
      invoice,
      client,
      reminderType
    );
    
    logger.info('Invoice reminder processed via queue', {
      jobId: job.id,
      invoiceId,
      clientId,
      result
    });
    
    return result;
  } catch (error) {
    logger.error('Failed to process invoice reminder via queue', {
      jobId: job.id,
      error: error.message
    });
    throw error;
  }
});

notificationQueue.process('send-recurring-invoice', async (job) => {
  const { templateId, invoiceId } = job.data;
  
  try {
    const Invoice = require('../models/Invoice');
    const Client = require('../models/Client');
    const notificationService = require('../services/notificationService');
    
    const invoice = await Invoice.findById(invoiceId);
    const client = await Client.findById(invoice.clientId);
    
    if (!invoice || !client) {
      throw new Error('Invoice or client not found');
    }
    
    const result = await notificationService.sendRecurringInvoiceNotification(
      invoice,
      client,
      job.data.templateName
    );
    
    logger.info('Recurring invoice notification processed via queue', {
      jobId: job.id,
      templateId,
      invoiceId,
      result
    });
    
    return result;
  } catch (error) {
    logger.error('Failed to process recurring invoice notification via queue', {
      jobId: job.id,
      error: error.message
    });
    throw error;
  }
});

recurringInvoiceQueue.process('generate-recurring-invoice', async (job) => {
  const { templateId } = job.data;
  
  try {
    const RecurringInvoice = require('../models/RecurringInvoice');
    const Invoice = require('../models/Invoice');
    const notificationService = require('../services/notificationService');
    
    const template = await RecurringInvoice.findById(templateId);
    
    if (!template || !template.active) {
      throw new Error('Template not found or inactive');
    }
    
    // Check if template should be paused (past end date)
    if (template.shouldPause()) {
      template.active = false;
      await template.save();
      logger.info('Recurring invoice template paused due to end date', { templateId });
      return { status: 'paused', reason: 'end_date_reached' };
    }
    
    // Generate invoice from template
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + template.paymentTerms);
    
    const invoiceData = {
      clientId: template.clientId,
      clientEmail: template.clientEmail,
      clientPhone: template.clientPhone,
      clientWhatsApp: template.clientWhatsApp,
      items: template.invoiceTemplate.items,
      subtotal: template.invoiceTemplate.subtotal,
      taxAmount: template.invoiceTemplate.taxAmount,
      discountAmount: template.invoiceTemplate.discountAmount,
      totalAmount: template.invoiceTemplate.totalAmount,
      dueDate: dueDate,
      recurringTemplateId: templateId,
      notes: template.invoiceTemplate.notes,
      currency: template.invoiceTemplate.currency
    };
    
    const invoice = new Invoice(invoiceData);
    await invoice.save();
    
    // Update template
    template.generatedInvoices.push(invoice._id);
    template.lastGenerated = new Date();
    template.nextDate = template.calculateNextDate();
    await template.save();
    
    // Send notification about recurring invoice creation
    const Client = require('../models/Client');
    const client = await Client.findById(template.clientId);
    
    if (client) {
      await notificationService.sendRecurringInvoiceNotification(
        invoice,
        client,
        template.name
      );
    }
    
    logger.info('Recurring invoice generated successfully', {
      templateId,
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber
    });
    
    return {
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      status: 'generated'
    };
  } catch (error) {
    logger.error('Failed to generate recurring invoice via queue', {
      jobId: job.id,
      templateId,
      error: error.message
    });
    throw error;
  }
});

// Add retry and error handling
notificationQueue.on('failed', (job, err) => {
  logger.error('Notification job failed permanently', {
    jobId: job.id,
    data: job.data,
    attempts: job.attemptsMade,
    error: err.message
  });
});

recurringInvoiceQueue.on('failed', (job, err) => {
  logger.error('Recurring invoice job failed permanently', {
    jobId: job.id,
    data: job.data,
    attempts: job.attemptsMade,
    error: err.message
  });
});

// Queue job adders
class QueueService {
  async addNotificationJob(data, options = {}) {
    const defaultOptions = {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: 10,
      removeOnFail: 50
    };
    
    return await notificationQueue.add(data, { ...defaultOptions, ...options });
  }

  async addRecurringInvoiceJob(data, options = {}) {
    const defaultOptions = {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 10000
      },
      removeOnComplete: 10,
      removeOnFail: 50
    };
    
    return await recurringInvoiceQueue.add(data, { ...defaultOptions, ...options });
  }

  // Schedule recurring invoice generation
  async scheduleRecurringInvoices() {
    try {
      const RecurringInvoice = require('../models/RecurringInvoice');
      
      const templatesToGenerate = await RecurringInvoice.find({
        active: true,
        nextDate: { $lte: new Date() }
      });
      
      logger.info(`Found ${templatesToGenerate.length} recurring invoices to generate`);
      
      for (const template of templatesToGenerate) {
        await this.addRecurringInvoiceJob({
          templateId: template._id,
          templateName: template.name
        }, {
          delay: 1000 * 60 * 5 // 5 minute delay
        });
      }
      
      return templatesToGenerate.length;
    } catch (error) {
      logger.error('Error scheduling recurring invoices', { error: error.message });
      throw error;
    }
  }

  // Check for due and overdue invoices
  async checkDueInvoices() {
    try {
      const Invoice = require('../models/Invoice');
      const Reminder = require('../models/Reminder');
      const NotificationHistory = require('../models/NotificationHistory');
      
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const overdueDate = new Date(today);
      overdueDate.setDate(overdueDate.getDate() - 1);
      
      // Find invoices that need reminders
      const dueInvoices = await Invoice.find({
        status: { $in: ['sent', 'viewed'] },
        dueDate: { $gte: today, $lt: tomorrow },
        remindersSent: { $size: 0 }
      });
      
      const overdueInvoices = await Invoice.find({
        status: { $in: ['sent', 'viewed'] },
        dueDate: { $lt: today }
      });
      
      logger.info(`Found ${dueInvoices.length} due invoices and ${overdueInvoices.length} overdue invoices`);
      
      let processedCount = 0;
      
      // Process due invoice reminders
      for (const invoice of dueInvoices) {
        const reminder = await Reminder.findOne({
          invoiceId: invoice._id,
          type: 'due',
          active: true
        });
        
        if (reminder && reminder.channels) {
          const channels = Object.keys(reminder.channels).filter(
            key => reminder.channels[key]
          );
          
          if (channels.length > 0) {
            await this.addNotificationJob({
              invoiceId: invoice._id,
              clientId: invoice.clientId,
              reminderType: 'due',
              channels,
              reminderId: reminder._id
            });
            
            processedCount++;
          }
        }
      }
      
      // Process overdue invoice reminders
      for (const invoice of overdueInvoices) {
        const reminder = await Reminder.findOne({
          invoiceId: invoice._id,
          type: 'overdue',
          active: true
        });
        
        if (reminder && reminder.channels) {
          const channels = Object.keys(reminder.channels).filter(
            key => reminder.channels[key]
          );
          
          if (channels.length > 0) {
            // Check if we haven't sent this reminder recently
            const recentReminder = await NotificationHistory.findOne({
              invoiceId: invoice._id,
              type: 'invoice_overdue',
              channel: { $in: channels },
              sentAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
            });
            
            if (!recentReminder) {
              await this.addNotificationJob({
                invoiceId: invoice._id,
                clientId: invoice.clientId,
                reminderType: 'overdue',
                channels,
                reminderId: reminder._id
              });
              
              processedCount++;
            }
          }
        }
      }
      
      return processedCount;
    } catch (error) {
      logger.error('Error checking due invoices', { error: error.message });
      throw error;
    }
  }

  // Get queue statistics
  async getQueueStats() {
    const notificationStats = await notificationQueue.getJobCounts();
    const recurringStats = await recurringInvoiceQueue.getJobCounts();
    
    return {
      notification: notificationStats,
      recurring: recurringStats
    };
  }

  // Clean completed/failed jobs older than specified days
  async cleanOldJobs(daysOld = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    
    const notificationCleaned = await notificationQueue.clean(cutoff.getTime(), 'completed');
    const recurringCleaned = await recurringInvoiceQueue.clean(cutoff.getTime(), 'completed');
    
    logger.info('Cleaned old jobs', {
      notificationCleaned,
      recurringCleaned,
      cutoff: cutoff.toISOString()
    });
    
    return {
      notificationCleaned,
      recurringCleaned
    };
  }
}

module.exports = new QueueService();
