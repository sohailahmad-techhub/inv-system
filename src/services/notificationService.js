const NotificationHistory = require('../models/NotificationHistory');
const emailService = require('./emailService');
const smsService = require('./smsService');
const whatsappService = require('./whatsappService');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/notification.log' }),
    new winston.transports.Console()
  ]
});

class NotificationService {
  constructor() {
    this.emailService = emailService;
    this.smsService = smsService;
    this.whatsappService = whatsappService;
  }

  async sendNotification(notificationData) {
    const {
      invoice,
      client,
      type,
      channels,
      reminderId,
      template
    } = notificationData;

    try {
      const results = [];
      
      for (const channel of channels) {
        try {
          const result = await this.sendSingleNotification({
            invoice,
            client,
            type,
            channel,
            reminderId,
            template
          });
          results.push(result);
        } catch (error) {
          logger.error(`Failed to send ${channel} notification`, {
            error: error.message,
            invoiceId: invoice._id,
            clientId: client._id
          });
          results.push({
            channel,
            success: false,
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      logger.error('Notification service error', { error: error.message });
      throw error;
    }
  }

  async sendSingleNotification({ invoice, client, type, channel, reminderId, template }) {
    // Check if notification already exists to prevent duplicates
    const existingNotification = await this.checkExistingNotification(
      invoice._id,
      type,
      channel
    );

    if (existingNotification) {
      logger.info('Duplicate notification prevented', {
        invoiceId: invoice._id,
        type,
        channel
      });
      return {
        channel,
        success: false,
        reason: 'duplicate_prevented'
      };
    }

    // Create notification history record
    const notificationHistory = new NotificationHistory({
      invoiceId: invoice._id,
      clientId: client._id,
      reminderId,
      type,
      channel,
      recipient: this.getRecipient(channel, client),
      message: template.message,
      subject: template.subject,
      status: 'pending'
    });

    try {
      let result;
      
      switch (channel) {
        case 'email':
          result = await this.emailService.sendEmail(
            client.email,
            template.subject,
            template.html || template.message
          );
          break;
          
        case 'sms':
          if (!client.phone || !this.smsService.isValidPhoneNumber(client.phone)) {
            throw new Error('Invalid or missing phone number');
          }
          result = await this.smsService.sendSMS(client.phone, template.message);
          break;
          
        case 'whatsapp':
          if (!client.whatsapp || !this.whatsappService.isValidWhatsAppNumber(client.whatsapp)) {
            throw new Error('Invalid or missing WhatsApp number');
          }
          result = await this.whatsappService.sendWhatsApp(client.whatsapp, template.message);
          break;
          
        default:
          throw new Error(`Unsupported channel: ${channel}`);
      }

      // Update notification history
      notificationHistory.markAsSent(result.messageId);
      if (result.cost !== undefined) {
        notificationHistory.metadata = { cost: result.cost };
      }
      await notificationHistory.save();

      logger.info('Notification sent successfully', {
        channel,
        invoiceId: invoice._id,
        clientId: client._id,
        messageId: result.messageId
      });

      return {
        channel,
        success: true,
        messageId: result.messageId,
        notificationHistoryId: notificationHistory._id
      };

    } catch (error) {
      // Update notification history with failure
      notificationHistory.markAsFailed(error.message);
      await notificationHistory.save();

      logger.error(`Failed to send ${channel} notification`, {
        error: error.message,
        invoiceId: invoice._id,
        clientId: client._id
      });

      throw error;
    }
  }

  async checkExistingNotification(invoiceId, type, channel) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return await NotificationHistory.findOne({
      invoiceId,
      type,
      channel,
      status: { $in: ['sent', 'delivered'] },
      sentAt: { $gte: thirtyDaysAgo }
    });
  }

  getRecipient(channel, client) {
    switch (channel) {
      case 'email':
        return client.email;
      case 'sms':
        return client.phone;
      case 'whatsapp':
        return client.whatsapp;
      default:
        return client.email;
    }
  }

  // Send invoice reminder based on client preferences
  async sendInvoiceReminder(invoice, client, reminderType = 'due') {
    const channels = this.getEnabledChannels(client, 'reminder');
    
    if (channels.length === 0) {
      throw new Error('No notification channels enabled for this client');
    }

    const template = this.getReminderTemplate(reminderType, invoice, client);
    
    return this.sendNotification({
      invoice,
      client,
      type: `invoice_${reminderType}`,
      channels,
      template
    });
  }

  // Send recurring invoice creation notification
  async sendRecurringInvoiceNotification(invoice, client, templateName) {
    const channels = this.getEnabledChannels(client, 'recurring');
    
    if (channels.length === 0) {
      throw new Error('No notification channels enabled for this client');
    }

    const template = this.getRecurringTemplate(invoice, client, templateName);
    
    return this.sendNotification({
      invoice,
      client,
      type: 'recurring_invoice_created',
      channels,
      template
    });
  }

  getEnabledChannels(client, type) {
    const enabled = [];
    
    if (client.notificationsEnabled?.email) {
      enabled.push('email');
    }
    if (client.notificationsEnabled?.sms && type === 'reminder') {
      enabled.push('sms');
    }
    if (client.notificationsEnabled?.whatsapp && type === 'reminder') {
      enabled.push('whatsapp');
    }
    
    return enabled;
  }

  getReminderTemplate(type, invoice, client) {
    const templates = {
      due: {
        subject: `Invoice ${invoice.invoiceNumber} Due Soon - ${client.name}`,
        message: `Hi ${client.name}, this is a reminder that invoice ${invoice.invoiceNumber} for $${invoice.totalAmount.toFixed(2)} is due on ${this.formatDate(invoice.dueDate)}. Please ensure payment is made by the due date. Thank you!`,
        html: this.getEmailHtmlTemplate('due', invoice, client)
      },
      overdue: {
        subject: `OVERDUE: Invoice ${invoice.invoiceNumber} - ${client.name}`,
        message: `Hi ${client.name}, invoice ${invoice.invoiceNumber} for $${invoice.totalAmount.toFixed(2)} was due on ${this.formatDate(invoice.dueDate)} and is now overdue. Please arrange payment immediately. Thank you!`,
        html: this.getEmailHtmlTemplate('overdue', invoice, client)
      }
    };

    return templates[type] || templates.due;
  }

  getRecurringTemplate(invoice, client, templateName) {
    return {
      subject: `New Recurring Invoice Created: ${templateName} - ${client.name}`,
      message: `Hi ${client.name}, a new invoice ${invoice.invoiceNumber} for $${invoice.totalAmount.toFixed(2)} has been automatically generated from your recurring template "${templateName}". Due on ${this.formatDate(invoice.dueDate)}. Thank you!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>New Recurring Invoice Created</h2>
          <p>Dear ${client.name},</p>
          <p>A new invoice has been automatically generated from your recurring template "<strong>${templateName}</strong>".</p>
          <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
            <p><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
            <p><strong>Amount:</strong> $${invoice.totalAmount.toFixed(2)}</p>
            <p><strong>Due Date:</strong> ${this.formatDate(invoice.dueDate)}</p>
          </div>
          <p>This invoice was created automatically based on your recurring billing schedule.</p>
          <p>Thank you for your continued business!</p>
        </div>
      `
    };
  }

  getEmailHtmlTemplate(type, invoice, client) {
    const companyName = process.env.COMPANY_NAME || 'Your Company';
    const companyEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    
    if (type === 'overdue') {
      return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #d32f2f;">Payment Overdue Notice</h2>
          <p>Dear ${client.name},</p>
          <p>This is to inform you that invoice <strong>${invoice.invoiceNumber}</strong> for <strong>$${invoice.totalAmount.toFixed(2)}</strong> was due on <strong>${this.formatDate(invoice.dueDate)}</strong> and is now overdue.</p>
          <div style="background-color: #ffebee; padding: 20px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #d32f2f;">
            <p><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
            <p><strong>Amount Due:</strong> $${invoice.totalAmount.toFixed(2)}</p>
            <p><strong>Original Due Date:</strong> ${this.formatDate(invoice.dueDate)}</p>
            <p><strong>Status:</strong> <span style="color: #d32f2f; font-weight: bold;">OVERDUE</span></p>
          </div>
          <p>Please arrange payment immediately to avoid further action.</p>
          <p>For questions or to discuss payment arrangements, please contact us at ${companyEmail}.</p>
          <p>Thank you for your prompt attention to this matter.</p>
          <p>${companyName}</p>
        </div>
      `;
    } else {
      return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Invoice Reminder</h2>
          <p>Dear ${client.name},</p>
          <p>This is a friendly reminder that invoice <strong>${invoice.invoiceNumber}</strong> for <strong>$${invoice.totalAmount.toFixed(2)}</strong> is due on <strong>${this.formatDate(invoice.dueDate)}</strong>.</p>
          <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
            <p><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
            <p><strong>Amount Due:</strong> $${invoice.totalAmount.toFixed(2)}</p>
            <p><strong>Due Date:</strong> ${this.formatDate(invoice.dueDate)}</p>
          </div>
          <p>Please ensure payment is made by the due date to avoid any late fees.</p>
          <p>If you have any questions, please contact us at ${companyEmail}.</p>
          <p>Thank you for your business!</p>
          <p>${companyName}</p>
        </div>
      `;
    }
  }

  formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  // Retry failed notifications
  async retryFailedNotifications() {
    try {
      const failedNotifications = await NotificationHistory.find({
        status: 'failed',
        retryCount: { $lt: 3 },
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
      });

      logger.info(`Found ${failedNotifications.length} failed notifications to retry`);

      const retryResults = [];
      
      for (const notification of failedNotifications) {
        try {
          // Get fresh invoice and client data
          const Invoice = require('../models/Invoice');
          const Client = require('../models/Client');
          
          const invoice = await Invoice.findById(notification.invoiceId);
          const client = await Client.findById(notification.clientId);
          
          if (!invoice || !client) {
            logger.error('Invoice or client not found for retry', {
              notificationId: notification._id,
              invoiceId: notification.invoiceId,
              clientId: notification.clientId
            });
            continue;
          }

          const template = this.getReminderTemplate(
            notification.type.replace('invoice_', ''),
            invoice,
            client
          );

          await this.sendSingleNotification({
            invoice,
            client,
            type: notification.type,
            channel: notification.channel,
            reminderId: notification.reminderId,
            template
          });

          retryResults.push({
            notificationId: notification._id,
            success: true
          });

        } catch (error) {
          logger.error('Retry failed', {
            notificationId: notification._id,
            error: error.message
          });
          retryResults.push({
            notificationId: notification._id,
            success: false,
            error: error.message
          });
        }
      }

      return retryResults;
    } catch (error) {
      logger.error('Error retrying failed notifications', { error: error.message });
      throw error;
    }
  }

  // Get notification statistics
  async getNotificationStats(startDate, endDate) {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
    const end = endDate || new Date();

    const stats = await NotificationHistory.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: {
            channel: '$channel',
            status: '$status'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.channel',
          statuses: {
            $push: {
              status: '$_id.status',
              count: '$count'
            }
          },
          total: { $sum: '$count' }
        }
      }
    ]);

    return stats;
  }
}

module.exports = new NotificationService();
