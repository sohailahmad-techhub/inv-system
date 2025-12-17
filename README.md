# Invoice Automation & Reminder System

A comprehensive automated invoice reminder and recurring invoice system built with Node.js, Express, and MongoDB. Features email, SMS, and WhatsApp notifications with queue-based processing and automated cron jobs.

## 🚀 Features

### Recurring Invoices
- **POST /api/recurring-invoices**: Create recurring invoice templates
- **GET /api/recurring-invoices**: List recurring invoices with pagination
- **PUT /api/recurring-invoices/:id**: Update recurring configuration
- **DELETE /api/recurring-invoices/:id**: Delete recurring invoice
- **POST /api/recurring-invoices/:id/generate**: Manual invoice generation
- **GET /api/recurring-invoices/:id/stats**: Template statistics
- **PATCH /api/recurring-invoices/:id/toggle**: Activate/deactivate templates

**Schema includes**:
- invoiceTemplate (items, subtotal, tax, discount, total)
- frequency (weekly/monthly/quarterly/yearly)
- nextDate (auto-calculated)
- active/endDate controls
- Automated cron job generation

### Reminder System
- **POST /api/reminders**: Create reminder rules
- **GET /api/reminders**: List reminders
- **PUT /api/reminders/:id**: Update reminder settings
- **DELETE /api/reminders/:id**: Delete reminder
- **POST /api/reminders/:id/test**: Test reminder
- **GET /api/reminders/:id/stats**: Reminder statistics

**Database schema**:
- invoiceId, clientId, type (due/overdue)
- daysBeforeDue, channels configuration
- Active status and sent reminder tracking

### Multi-Channel Notifications

#### Email Notifications (Nodemailer + SMTP/SendGrid)
- Professional HTML email templates
- Due date reminders
- Overdue payment notices
- Recurring invoice creation alerts
- Support for custom SMTP or SendGrid API

#### SMS Reminders (Twilio)
- Concise SMS templates
- Due and overdue notifications
- International phone number support
- Cost tracking per message

#### WhatsApp Reminders (Twilio WhatsApp API)
- Rich formatting with Markdown
- Invoice reminder templates
- Media message support (future enhancement)
- Verified number validation

### Notification Management
- **GET /api/notifications/history**: Complete notification history
- **POST /api/notifications/history/:id/retry**: Retry failed notifications
- **GET /api/notifications/stats**: Delivery statistics
- **POST /api/notifications/send**: Manual notifications
- **GET /api/notifications/delivery-status/:messageId**: Track delivery status

### Background Jobs & Automation

#### Queue System (Bull + Redis)
- Job processing with retries and backoff
- Separate queues for different notification types
- Failed job handling and retry logic
- Job statistics and cleanup

#### Cron Jobs (node-cron)
- **6:00 AM**: Generate recurring invoices
- **9:00 AM**: Check due invoices for reminders
- **10:00 AM**: Process overdue invoices
- **Every 30 minutes**: Retry failed notifications
- **Sunday 2:00 AM**: Clean old job data
- **Hourly**: Update statistics and health checks

### Client Management
- Complete client profile management
- Notification preference configuration
- Contact method selection (email/SMS/WhatsApp)
- Client statistics and activity tracking
- Status management (active/inactive/suspended)

### Security & Authentication
- JWT-based authentication
- Role-based access control (admin/user/viewer)
- Rate limiting and security headers
- Input validation and sanitization
- Request tracking and logging

## 🛠️ Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose
- **Queue**: Bull (Redis-based job queue)
- **Cron Jobs**: node-cron
- **Authentication**: JWT with bcryptjs
- **Email**: Nodemailer + SMTP/SendGrid
- **SMS/WhatsApp**: Twilio
- **Validation**: express-validator
- **Logging**: Winston
- **Security**: helmet, cors, rate limiting

## 📦 Installation

1. **Clone and setup**:
```bash
git clone <repository-url>
cd invoice-automation-system
npm install
```

2. **Environment Configuration**:
```bash
cp .env.example .env
```

Configure your environment variables in `.env`:

```env
# Server
PORT=3000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/invoice_automation

# JWT
JWT_SECRET=your_super_secret_jwt_key_here

# Email (Choose one approach)
# Option 1: Custom SMTP
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_password
EMAIL_FROM=noreply@yourcompany.com

# Option 2: SendGrid
SENDGRID_API_KEY=your_sendgrid_api_key

# Twilio (for SMS + WhatsApp)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WHATSAPP_NUMBER=+1234567890

# Redis (for Bull queue)
REDIS_URL=redis://localhost:6379

# Application Settings
BATCH_NOTIFICATIONS=true
MAX_RETRIES=3
RETRY_DELAY=5000

# Defaults
DEFAULT_EMAIL_REMINDERS=true
DEFAULT_SMS_REMINDERS=false
DEFAULT_WHATSAPP_REMINDERS=false
```

3. **Start dependencies**:
```bash
# MongoDB
mongod

# Redis
redis-server

# Application
npm run dev
```

## 🚀 Usage

### 1. User Authentication
```bash
# Register
POST /api/auth/register
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}

# Login
POST /api/auth/login
{
  "email": "john@example.com",
  "password": "password123"
}
```

### 2. Create Client
```bash
POST /api/clients
{
  "name": "Acme Corp",
  "email": "billing@acme.com",
  "phone": "+1234567890",
  "whatsapp": "+1234567890",
  "company": "Acme Corporation",
  "paymentTerms": 30,
  "preferredContactMethod": "email",
  "notificationsEnabled": {
    "email": true,
    "sms": false,
    "whatsapp": true
  }
}
```

### 3. Create Recurring Invoice Template
```bash
POST /api/recurring-invoices
{
  "name": "Monthly Service Subscription",
  "clientId": "client_id_here",
  "frequency": "monthly",
  "nextDate": "2024-01-01T00:00:00.000Z",
  "paymentTerms": 30,
  "invoiceTemplate": {
    "items": [
      {
        "description": "Web Development Services",
        "quantity": 1,
        "unitPrice": 1000,
        "total": 1000
      }
    ],
    "subtotal": 1000,
    "taxAmount": 100,
    "discountAmount": 0,
    "totalAmount": 1100,
    "notes": "Monthly recurring services"
  }
}
```

### 4. Create Reminder Rule
```bash
POST /api/reminders
{
  "name": "Invoice Due Reminder",
  "clientId": "client_id_here",
  "type": "due",
  "daysBeforeDue": 3,
  "channels": {
    "email": true,
    "sms": false,
    "whatsapp": true
  },
  "template": {
    "subject": "Invoice Due Soon - {{clientName}}",
    "message": "Your invoice {{invoiceNumber}} for ${{totalAmount}} is due on {{dueDate}}"
  }
}
```

### 5. Manual Operations
```bash
# Generate invoice from template
POST /api/recurring-invoices/:id/generate

# Test reminder
POST /api/reminders/:id/test

# Send manual notification
POST /api/notifications/send
{
  "invoiceId": "invoice_id",
  "clientId": "client_id",
  "type": "invoice_reminder",
  "channels": ["email", "whatsapp"]
}

# Trigger jobs manually
POST /api/admin/jobs/trigger-recurring
POST /api/admin/jobs/trigger-reminders
POST /api/admin/jobs/retry-notifications
```

## 📊 API Documentation

### Recurring Invoices
- `POST /api/recurring-invoices` - Create template
- `GET /api/recurring-invoices` - List templates (with filters: active, frequency, clientId)
- `GET /api/recurring-invoices/:id` - Get template
- `PUT /api/recurring-invoices/:id` - Update template
- `DELETE /api/recurring-invoices/:id` - Delete template
- `POST /api/recurring-invoices/:id/generate` - Manual generation
- `GET /api/recurring-invoices/:id/stats` - Template statistics
- `PATCH /api/recurring-invoices/:id/toggle` - Toggle active status

### Reminders
- `POST /api/reminders` - Create reminder rule
- `GET /api/reminders` - List reminders (with filters: active, type, clientId)
- `GET /api/reminders/:id` - Get reminder
- `PUT /api/reminders/:id` - Update reminder
- `DELETE /api/reminders/:id` - Delete reminder
- `POST /api/reminders/:id/test` - Test reminder
- `GET /api/reminders/:id/stats` - Reminder statistics
- `PATCH /api/reminders/:id/toggle` - Toggle active status

### Notifications
- `GET /api/notifications/history` - Notification history
- `GET /api/notifications/history/:id` - Get notification
- `POST /api/notifications/history/:id/retry` - Retry failed notification
- `GET /api/notifications/stats` - Delivery statistics
- `POST /api/notifications/send` - Manual notification
- `POST /api/notifications/retry-failed` - Retry all failed
- `GET /api/notifications/delivery-status/:messageId` - Delivery tracking

### Clients
- `POST /api/clients` - Create client
- `GET /api/clients` - List clients (with filters: status, search)
- `GET /api/clients/:id` - Get client
- `PUT /api/clients/:id` - Update client
- `PATCH /api/clients/:id/notification-preferences` - Update preferences
- `DELETE /api/clients/:id` - Delete client
- `GET /api/clients/:id/stats` - Client statistics
- `PATCH /api/clients/:id/toggle-status` - Toggle status

### Authentication
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get profile
- `PUT /api/auth/profile` - Update profile
- `PUT /api/auth/change-password` - Change password
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/logout` - Logout

### Health Check
- `GET /health` - System health check
- `GET /api` - API documentation

## 🔧 Configuration

### Email Templates
Email templates support variable substitution:
- `{{clientName}}` - Client's name
- `{{invoiceNumber}}` - Invoice number
- `{{totalAmount}}` - Invoice amount
- `{{dueDate}}` - Due date
- `{{companyName}}` - Company name
- `{{companyEmail}}` - Company email

### SMS Templates
SMS templates are concise and support the same variables:
- Automatic character count optimization
- Professional tone maintained

### WhatsApp Templates
WhatsApp templates use Markdown formatting:
- `*bold*` for emphasis
- `\n` for line breaks
- Professional message structure

### Notification Channels
Each client can configure preferences:
- Email: Default enabled
- SMS: Optional, requires phone number
- WhatsApp: Optional, requires WhatsApp number
- Batch notifications: Reduces costs

## 📈 Monitoring & Analytics

### Health Checks
- `/health` endpoint shows system status
- Database connection status
- Cron job status
- Queue statistics

### Logging
- Winston logging to files and console
- Separate log files for different services
- Request tracking with unique IDs
- Error tracking with stack traces

### Statistics
- Invoice generation and payment rates
- Notification delivery rates by channel
- Client activity and revenue metrics
- System performance metrics

## 🔒 Security Features

- **Authentication**: JWT tokens with 24-hour expiry
- **Authorization**: Role-based access control
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Input Validation**: All inputs validated and sanitized
- **Security Headers**: Helmet.js for security headers
- **CORS**: Configurable origin policies
- **Request Tracking**: Unique IDs for audit trails

## 🚀 Deployment

### Production Setup
1. **Environment**: Set `NODE_ENV=production`
2. **Database**: Use MongoDB Atlas or production MongoDB
3. **Redis**: Use managed Redis service (Redis Cloud, etc.)
4. **Email**: Use SendGrid, AWS SES, or production SMTP
5. **Domain**: Configure proper CORS origins
6. **SSL**: Enable HTTPS
7. **Process Manager**: Use PM2 or similar

### Docker Support (Future Enhancement)
```dockerfile
# Example Dockerfile structure
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "src/server.js"]
```

### PM2 Configuration
```javascript
module.exports = {
  apps: [{
    name: 'invoice-automation',
    script: 'src/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

## 🧪 Testing

### Manual Testing
1. Create test client
2. Create recurring invoice template
3. Set reminder rules
4. Test manual operations
5. Check notification delivery

### Health Check
```bash
curl http://localhost:3000/health
```

### Job Status
```bash
# Check job status
GET /health
# Look for "cronJobs" section
```

## 🔧 Troubleshooting

### Common Issues

1. **Email not sending**:
   - Check SMTP credentials
   - Verify EMAIL_FROM address
   - Check spam folder

2. **SMS/WhatsApp not working**:
   - Verify Twilio credentials
   - Check phone number format
   - Verify Twilio phone number setup

3. **Recurring invoices not generating**:
   - Check cron job status
   - Verify template is active
   - Check nextDate is in the past

4. **Database connection issues**:
   - Verify MongoDB is running
   - Check connection string
   - Verify network access

### Logs
Check log files:
- `logs/combined.log` - General application logs
- `logs/error.log` - Error logs
- `logs/email.log` - Email service logs
- `logs/sms.log` - SMS service logs
- `logs/whatsapp.log` - WhatsApp service logs
- `logs/cron.log` - Cron job logs
- `logs/queue.log` - Queue service logs

## 📝 License

MIT License - see LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📞 Support

For support and questions:
- Check the logs first
- Review API documentation
- Test with manual job triggers
- Check health endpoints

---

**Built with ❤️ for automated invoice management**
