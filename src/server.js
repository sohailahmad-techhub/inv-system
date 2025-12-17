require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const winston = require('winston');

// Import database connection
const databaseConnection = require('./database/connection');

// Import routes
const authRouter = require('./routes/auth');
const recurringInvoicesRouter = require('./routes/recurringInvoices');
const remindersRouter = require('./routes/reminders');
const notificationsRouter = require('./routes/notifications');
const clientsRouter = require('./routes/clients');

// Import cron jobs service
const cronJobsService = require('./jobs/cronJobs');

// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'invoice-automation' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class InvoiceAutomationServer {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
      credentials: true,
      optionsSuccessStatus: 200
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
      message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.'
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Compression middleware
    this.app.use(compression());

    // Logging middleware
    this.app.use(morgan('combined', {
      stream: { write: message => logger.info(message.trim()) }
    }));

    // Request ID middleware (for tracking)
    this.app.use((req, res, next) => {
      req.id = Math.random().toString(36).substr(2, 9);
      res.setHeader('X-Request-ID', req.id);
      next();
    });
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const dbStatus = databaseConnection.getStatus();
      const jobStatus = cronJobsService.getJobStatus();
      
      res.json({
        success: true,
        message: 'Invoice Automation System is running',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
        status: 'healthy',
        services: {
          database: dbStatus,
          cronJobs: jobStatus
        }
      });
    });

    // API routes
    this.app.use('/api/auth', authRouter);
    this.app.use('/api/recurring-invoices', recurringInvoicesRouter);
    this.app.use('/api/reminders', remindersRouter);
    this.app.use('/api/notifications', notificationsRouter);
    this.app.use('/api/clients', clientsRouter);

    // Admin routes for manual job triggering
    this.app.post('/api/admin/jobs/trigger-recurring', async (req, res) => {
      try {
        const result = await cronJobsService.triggerRecurringInvoiceGeneration();
        res.json({
          success: true,
          message: 'Recurring invoice generation triggered',
          data: result
        });
      } catch (error) {
        logger.error('Manual recurring trigger failed', { error: error.message });
        res.status(500).json({
          success: false,
          message: 'Failed to trigger recurring invoice generation',
          error: error.message
        });
      }
    });

    this.app.post('/api/admin/jobs/trigger-reminders', async (req, res) => {
      try {
        const result = await cronJobsService.triggerDueInvoiceCheck();
        res.json({
          success: true,
          message: 'Due invoice check triggered',
          data: result
        });
      } catch (error) {
        logger.error('Manual reminder trigger failed', { error: error.message });
        res.status(500).json({
          success: false,
          message: 'Failed to trigger due invoice check',
          error: error.message
        });
      }
    });

    this.app.post('/api/admin/jobs/retry-notifications', async (req, res) => {
      try {
        const result = await cronJobsService.triggerNotificationRetry();
        res.json({
          success: true,
          message: 'Notification retry triggered',
          data: result
        });
      } catch (error) {
        logger.error('Manual notification retry failed', { error: error.message });
        res.status(500).json({
          success: false,
          message: 'Failed to trigger notification retry',
          error: error.message
        });
      }
    });

    // API documentation endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        success: true,
        message: 'Invoice Automation System API',
        version: '1.0.0',
        endpoints: {
          auth: {
            'POST /api/auth/register': 'Register new user',
            'POST /api/auth/login': 'Login user',
            'GET /api/auth/profile': 'Get current user profile',
            'PUT /api/auth/profile': 'Update user profile',
            'PUT /api/auth/change-password': 'Change user password',
            'POST /api/auth/refresh': 'Refresh JWT token',
            'POST /api/auth/logout': 'Logout user'
          },
          recurringInvoices: {
            'POST /api/recurring-invoices': 'Create recurring invoice template',
            'GET /api/recurring-invoices': 'List recurring invoices',
            'GET /api/recurring-invoices/:id': 'Get single recurring invoice',
            'PUT /api/recurring-invoices/:id': 'Update recurring invoice',
            'DELETE /api/recurring-invoices/:id': 'Delete recurring invoice',
            'POST /api/recurring-invoices/:id/generate': 'Generate invoice manually',
            'GET /api/recurring-invoices/:id/stats': 'Get template statistics',
            'PATCH /api/recurring-invoices/:id/toggle': 'Toggle active status'
          },
          reminders: {
            'POST /api/reminders': 'Create reminder rule',
            'GET /api/reminders': 'List reminders',
            'GET /api/reminders/:id': 'Get single reminder',
            'PUT /api/reminders/:id': 'Update reminder',
            'DELETE /api/reminders/:id': 'Delete reminder',
            'POST /api/reminders/:id/test': 'Test reminder',
            'PATCH /api/reminders/:id/toggle': 'Toggle reminder status',
            'GET /api/reminders/:id/stats': 'Get reminder statistics'
          },
          notifications: {
            'GET /api/notifications/history': 'Get notification history',
            'GET /api/notifications/history/:id': 'Get single notification',
            'POST /api/notifications/history/:id/retry': 'Retry failed notification',
            'GET /api/notifications/stats': 'Get notification statistics',
            'POST /api/notifications/send': 'Send manual notification',
            'POST /api/notifications/retry-failed': 'Retry all failed notifications',
            'GET /api/notifications/delivery-status/:messageId': 'Get delivery status'
          },
          clients: {
            'POST /api/clients': 'Create client',
            'GET /api/clients': 'List clients',
            'GET /api/clients/:id': 'Get single client',
            'PUT /api/clients/:id': 'Update client',
            'PATCH /api/clients/:id/notification-preferences': 'Update notification preferences',
            'DELETE /api/clients/:id': 'Delete client',
            'GET /api/clients/:id/stats': 'Get client statistics',
            'PATCH /api/clients/:id/toggle-status': 'Toggle client status'
          },
          admin: {
            'POST /api/admin/jobs/trigger-recurring': 'Manually trigger recurring invoice generation',
            'POST /api/admin/jobs/trigger-reminders': 'Manually trigger due invoice check',
            'POST /api/admin/jobs/retry-notifications': 'Manually trigger notification retry'
          }
        }
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`,
        timestamp: new Date().toISOString()
      });
    });
  }

  setupErrorHandling() {
    // Global error handler
    this.app.use((error, req, res, next) => {
      logger.error('Unhandled error:', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: req.id
      });

      // Don't leak error details in production
      const isDevelopment = process.env.NODE_ENV === 'development';
      
      res.status(error.status || 500).json({
        success: false,
        message: isDevelopment ? error.message : 'Internal server error',
        ...(isDevelopment && { stack: error.stack }),
        requestId: req.id
      });
    });

    // Unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', {
        promise,
        reason: reason instanceof Error ? reason.message : reason
      });
    });

    // Uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    });
  }

  async start() {
    try {
      // Connect to database
      logger.info('Connecting to database...');
      await databaseConnection.connect();
      
      // Start cron jobs
      logger.info('Starting cron jobs...');
      cronJobsService.startAllJobs();
      
      // Start server
      const server = this.app.listen(this.port, () => {
        logger.info(`Invoice Automation Server started on port ${this.port}`, {
          environment: process.env.NODE_ENV || 'development',
          nodeVersion: process.version,
          pid: process.pid
        });
      });

      // Graceful shutdown
      const gracefulShutdown = (signal) => {
        logger.info(`Received ${signal}, shutting down gracefully...`);
        
        server.close(async () => {
          try {
            // Stop cron jobs
            cronJobsService.stopAllJobs();
            
            // Close database connection
            await databaseConnection.gracefulShutdown(signal);
            
            logger.info('Server shutdown complete');
            process.exit(0);
          } catch (error) {
            logger.error('Error during shutdown:', error);
            process.exit(1);
          }
        });
      };

      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));

      return server;
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  const server = new InvoiceAutomationServer();
  server.start();
}

module.exports = InvoiceAutomationServer;
