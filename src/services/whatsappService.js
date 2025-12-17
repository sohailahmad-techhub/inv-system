const twilio = require('twilio');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/whatsapp.log' }),
    new winston.transports.Console()
  ]
});

class WhatsAppService {
  constructor() {
    this.client = null;
    this.whatsappNumber = null;
    this.isConfigured = false;
    this.initializeTwilio();
  }

  initializeTwilio() {
    try {
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_NUMBER) {
        this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        this.whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
        this.isConfigured = true;
        logger.info('WhatsApp service initialized successfully');
      } else {
        throw new Error('Twilio WhatsApp credentials not configured');
      }
    } catch (error) {
      logger.error('Failed to initialize WhatsApp service:', error);
      this.isConfigured = false;
    }
  }

  async sendWhatsApp(to, message) {
    if (!this.isConfigured) {
      throw new Error('WhatsApp service not configured');
    }

    try {
      // Format phone number for WhatsApp
      const formattedTo = this.formatWhatsAppNumber(to);
      
      const result = await this.client.messages.create({
        body: message,
        from: `whatsapp:${this.whatsappNumber}`,
        to: `whatsapp:${formattedTo}`
      });

      logger.info('WhatsApp message sent successfully', { 
        to: formattedTo, 
        messageId: result.sid 
      });
      
      return {
        success: true,
        messageId: result.sid,
        provider: 'whatsapp',
        cost: result.price ? parseFloat(result.price) : 0
      };
    } catch (error) {
      logger.error('Failed to send WhatsApp message', { 
        to: to, 
        error: error.message 
      });
      throw new Error(`WhatsApp sending failed: ${error.message}`);
    }
  }

  async sendBulkWhatsApp(messages) {
    const results = [];
    
    for (const msg of messages) {
      try {
        const result = await this.sendWhatsApp(msg.to, msg.message);
        results.push({ ...msg, ...result });
      } catch (error) {
        results.push({ ...msg, success: false, error: error.message });
      }
    }
    
    return results;
  }

  // Template methods
  async sendInvoiceReminder(invoice, client, reminderType = 'due') {
    const message = this.getWhatsAppTemplate(reminderType)
      .replace('{{clientName}}', client.name)
      .replace('{{invoiceNumber}}', invoice.invoiceNumber)
      .replace('{{totalAmount}}', `$${invoice.totalAmount.toFixed(2)}`)
      .replace('{{dueDate}}', this.formatDate(invoice.dueDate));

    return this.sendWhatsApp(client.whatsapp, message);
  }

  async sendPaymentReminder(invoice, client) {
    return this.sendInvoiceReminder(invoice, client, 'overdue');
  }

  async sendRecurringInvoiceCreated(invoice, client, templateName) {
    const message = this.getWhatsAppTemplate('recurring_created')
      .replace('{{clientName}}', client.name)
      .replace('{{templateName}}', templateName)
      .replace('{{invoiceNumber}}', invoice.invoiceNumber)
      .replace('{{totalAmount}}', `$${invoice.totalAmount.toFixed(2)}`)
      .replace('{{dueDate}}', this.formatDate(invoice.dueDate));

    return this.sendWhatsApp(client.whatsapp, message);
  }

  getWhatsAppTemplate(type) {
    const templates = {
      due: `*Invoice Reminder*\n\nHi {{clientName}}, this is a friendly reminder that invoice *{{invoiceNumber}}* for *${{totalAmount}}* is due on *{{dueDate}}*.\n\nPlease ensure payment is made by the due date.\n\nThank you!`,
      overdue: `*Payment Overdue Notice*\n\nHi {{clientName}}, invoice *{{invoiceNumber}}* for *${{totalAmount}}* was due on *{{dueDate}}* and is now overdue.\n\nPlease arrange payment immediately to avoid further action.\n\nThank you for your prompt attention!`,
      recurring_created: `*New Recurring Invoice*\n\nHi {{clientName}}, a new invoice *{{invoiceNumber}}* for *${{totalAmount}}* has been automatically generated from your recurring template *"{{templateName}}"*.\n\nDue date: *{{dueDate}}*\n\nThis invoice was created automatically based on your recurring billing schedule.\n\nThank you for your continued business!`
    };

    return templates[type] || templates.due;
  }

  formatWhatsAppNumber(phone) {
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

  // Validate WhatsApp number format
  isValidWhatsAppNumber(phone) {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
  }

  // Send structured message with media (for future enhancement)
  async sendMediaMessage(to, message, mediaUrl = null) {
    if (!this.isConfigured) {
      throw new Error('WhatsApp service not configured');
    }

    try {
      const formattedTo = this.formatWhatsAppNumber(to);
      
      const messageData = {
        body: message,
        from: `whatsapp:${this.whatsappNumber}`,
        to: `whatsapp:${formattedTo}`
      };

      if (mediaUrl) {
        messageData.mediaUrl = [mediaUrl];
      }

      const result = await this.client.messages.create(messageData);

      logger.info('WhatsApp media message sent successfully', { 
        to: formattedTo, 
        messageId: result.sid,
        hasMedia: !!mediaUrl
      });
      
      return {
        success: true,
        messageId: result.sid,
        provider: 'whatsapp',
        cost: result.price ? parseFloat(result.price) : 0
      };
    } catch (error) {
      logger.error('Failed to send WhatsApp media message', { 
        to: to, 
        error: error.message 
      });
      throw new Error(`WhatsApp media message failed: ${error.message}`);
    }
  }
}

module.exports = new WhatsAppService();
