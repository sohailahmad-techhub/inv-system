const nodemailer = require('nodemailer');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/email.log' }),
    new winston.transports.Console()
  ]
});

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.initializeTransporter();
  }

  initializeTransporter() {
    try {
      // Try SendGrid first if API key is provided
      if (process.env.SENDGRID_API_KEY) {
        this.transporter = nodemailer.createTransport({
          service: 'SendGrid',
          auth: {
            user: 'apikey',
            pass: process.env.SENDGRID_API_KEY
          }
        });
      } else if (process.env.EMAIL_HOST) {
        // Use custom SMTP
        this.transporter = nodemailer.createTransport({
          host: process.env.EMAIL_HOST,
          port: process.env.EMAIL_PORT || 587,
          secure: process.env.EMAIL_SECURE === 'true',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });
      } else {
        throw new Error('No email service configured');
      }

      this.isConfigured = true;
      logger.info('Email service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize email service:', error);
      this.isConfigured = false;
    }
  }

  async sendEmail(to, subject, htmlContent, textContent = null) {
    if (!this.isConfigured) {
      throw new Error('Email service not configured');
    }

    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to,
        subject,
        html: htmlContent,
        text: textContent || this.stripHtml(htmlContent)
      };

      const result = await this.transporter.sendMail(mailOptions);
      logger.info('Email sent successfully', { to, subject, messageId: result.messageId });
      
      return {
        success: true,
        messageId: result.messageId,
        provider: 'email'
      };
    } catch (error) {
      logger.error('Failed to send email', { to, subject, error: error.message });
      throw new Error(`Email sending failed: ${error.message}`);
    }
  }

  async sendBulkEmails(emails) {
    const results = [];
    
    for (const email of emails) {
      try {
        const result = await this.sendEmail(
          email.to, 
          email.subject, 
          email.html, 
          email.text
        );
        results.push({ ...email, ...result });
      } catch (error) {
        results.push({ ...email, success: false, error: error.message });
      }
    }
    
    return results;
  }

  // Template methods
  async sendInvoiceReminder(invoice, client, reminderType = 'due') {
    const template = this.getEmailTemplate(reminderType);
    const subject = template.subject
      .replace('{{invoiceNumber}}', invoice.invoiceNumber)
      .replace('{{clientName}}', client.name);
    
    const htmlContent = template.html
      .replace('{{clientName}}', client.name)
      .replace('{{invoiceNumber}}', invoice.invoiceNumber)
      .replace('{{totalAmount}}', `$${invoice.totalAmount.toFixed(2)}`)
      .replace('{{dueDate}}', this.formatDate(invoice.dueDate))
      .replace('{{companyName}}', process.env.COMPANY_NAME || 'Your Company')
      .replace('{{companyEmail}}', process.env.EMAIL_FROM || process.env.EMAIL_USER);

    return this.sendEmail(client.email, subject, htmlContent);
  }

  async sendPaymentReminder(invoice, client) {
    return this.sendInvoiceReminder(invoice, client, 'overdue');
  }

  async sendRecurringInvoiceCreated(invoice, client, templateName) {
    const template = this.getEmailTemplate('recurring_created');
    const subject = template.subject
      .replace('{{templateName}}', templateName)
      .replace('{{clientName}}', client.name);
    
    const htmlContent = template.html
      .replace('{{clientName}}', client.name)
      .replace('{{templateName}}', templateName)
      .replace('{{invoiceNumber}}', invoice.invoiceNumber)
      .replace('{{totalAmount}}', `$${invoice.totalAmount.toFixed(2)}`)
      .replace('{{dueDate}}', this.formatDate(invoice.dueDate));

    return this.sendEmail(client.email, subject, htmlContent);
  }

  getEmailTemplate(type) {
    const templates = {
      due: {
        subject: 'Invoice {{invoiceNumber}} Due Soon - {{clientName}}',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Invoice Reminder</h2>
            <p>Dear {{clientName}},</p>
            <p>This is a friendly reminder that invoice <strong>{{invoiceNumber}}</strong> for <strong>{{totalAmount}}</strong> is due on <strong>{{dueDate}}</strong>.</p>
            <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
              <p><strong>Invoice Number:</strong> {{invoiceNumber}}</p>
              <p><strong>Amount Due:</strong> {{totalAmount}}</p>
              <p><strong>Due Date:</strong> {{dueDate}}</p>
            </div>
            <p>Please ensure payment is made by the due date to avoid any late fees.</p>
            <p>If you have any questions, please contact us at {{companyEmail}}.</p>
            <p>Thank you for your business!</p>
            <p>{{companyName}}</p>
          </div>
        `
      },
      overdue: {
        subject: 'OVERDUE: Invoice {{invoiceNumber}} - {{clientName}}',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #d32f2f;">Payment Overdue Notice</h2>
            <p>Dear {{clientName}},</p>
            <p>This is to inform you that invoice <strong>{{invoiceNumber}}</strong> for <strong>{{totalAmount}}</strong> was due on <strong>{{dueDate}}</strong> and is now overdue.</p>
            <div style="background-color: #ffebee; padding: 20px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #d32f2f;">
              <p><strong>Invoice Number:</strong> {{invoiceNumber}}</p>
              <p><strong>Amount Due:</strong> {{totalAmount}}</p>
              <p><strong>Original Due Date:</strong> {{dueDate}}</p>
              <p><strong>Status:</strong> <span style="color: #d32f2f; font-weight: bold;">OVERDUE</span></p>
            </div>
            <p>Please arrange payment immediately to avoid further action.</p>
            <p>For questions or to discuss payment arrangements, please contact us at {{companyEmail}}.</p>
            <p>Thank you for your prompt attention to this matter.</p>
            <p>{{companyName}}</p>
          </div>
        `
      },
      recurring_created: {
        subject: 'New Recurring Invoice Created: {{templateName}} - {{clientName}}',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>New Recurring Invoice Created</h2>
            <p>Dear {{clientName}},</p>
            <p>A new invoice has been automatically generated from your recurring template "<strong>{{templateName}}</strong>".</p>
            <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
              <p><strong>Invoice Number:</strong> {{invoiceNumber}}</p>
              <p><strong>Amount:</strong> {{totalAmount}}</p>
              <p><strong>Due Date:</strong> {{dueDate}}</p>
            </div>
            <p>This invoice was created automatically based on your recurring billing schedule.</p>
            <p>Thank you for your continued business!</p>
            <p>{{companyName}}</p>
          </div>
        `
      }
    };

    return templates[type] || templates.due;
  }

  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}

module.exports = new EmailService();
