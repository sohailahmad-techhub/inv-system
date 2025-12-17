const twilio = require('twilio');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/sms.log' }),
    new winston.transports.Console()
  ]
});

class SMSService {
  constructor() {
    this.client = null;
    this.phoneNumber = null;
    this.isConfigured = false;
    this.initializeTwilio();
  }

  initializeTwilio() {
    try {
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;
        this.isConfigured = true;
        logger.info('SMS service initialized successfully');
      } else {
        throw new Error('Twilio credentials not configured');
      }
    } catch (error) {
      logger.error('Failed to initialize SMS service:', error);
      this.isConfigured = false;
    }
  }

  async sendSMS(to, message) {
    if (!this.isConfigured) {
      throw new Error('SMS service not configured');
    }

    try {
      // Format phone number
      const formattedTo = this.formatPhoneNumber(to);
      
      const result = await this.client.messages.create({
        body: message,
        from: this.phoneNumber,
        to: formattedTo
      });

      logger.info('SMS sent successfully', { 
        to: formattedTo, 
        messageId: result.sid 
      });
      
      return {
        success: true,
        messageId: result.sid,
        provider: 'sms',
        cost: result.price ? parseFloat(result.price) : 0
      };
    } catch (error) {
      logger.error('Failed to send SMS', { 
        to: to, 
        error: error.message 
      });
      throw new Error(`SMS sending failed: ${error.message}`);
    }
  }

  async sendBulkSMS(messages) {
    const results = [];
    
    for (const sms of messages) {
      try {
        const result = await this.sendSMS(sms.to, sms.message);
        results.push({ ...sms, ...result });
      } catch (error) {
        results.push({ ...sms, success: false, error: error.message });
      }
    }
    
    return results;
  }

  // Template methods
  async sendInvoiceReminder(invoice, client, reminderType = 'due') {
    const message = this.getSMSTemplate(reminderType)
      .replace('{{clientName}}', client.name)
      .replace('{{invoiceNumber}}', invoice.invoiceNumber)
      .replace('{{totalAmount}}', `$${invoice.totalAmount.toFixed(2)}`)
      .replace('{{dueDate}}', this.formatDate(invoice.dueDate));

    return this.sendSMS(client.phone, message);
  }

  async sendPaymentReminder(invoice, client) {
    return this.sendInvoiceReminder(invoice, client, 'overdue');
  }

  async sendRecurringInvoiceCreated(invoice, client, templateName) {
    const message = this.getSMSTemplate('recurring_created')
      .replace('{{clientName}}', client.name)
      .replace('{{templateName}}', templateName)
      .replace('{{invoiceNumber}}', invoice.invoiceNumber)
      .replace('{{totalAmount}}', `$${invoice.totalAmount.toFixed(2)}`)
      .replace('{{dueDate}}', this.formatDate(invoice.dueDate));

    return this.sendSMS(client.phone, message);
  }

  getSMSTemplate(type) {
    const templates = {
      due: `Hi {{clientName}}, this is a reminder that invoice {{invoiceNumber}} for {{totalAmount}} is due on {{dueDate}}. Please ensure payment is made by the due date. Thank you!`,
      overdue: `Hi {{clientName}}, invoice {{invoiceNumber}} for {{totalAmount}} was due on {{dueDate}} and is now overdue. Please arrange payment immediately. Thank you!`,
      recurring_created: `Hi {{clientName}}, a new invoice {{invoiceNumber}} for {{totalAmount}} has been automatically generated from your recurring template "{{templateName}}". Due on {{dueDate}}. Thank you!`
    };

    return templates[type] || templates.due;
  }

  formatPhoneNumber(phone) {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // If it starts with 1, keep it, otherwise add 1 for US numbers
    const formatted = cleaned.length === 10 ? `1${cleaned}` : cleaned;
    
    return `+${formatted}`;
  }

  formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  // Validate phone number format
  isValidPhoneNumber(phone) {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
  }
}

module.exports = new SMSService();
