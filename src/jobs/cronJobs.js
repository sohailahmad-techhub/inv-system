const cron = require('node-cron');
const winston = require('winston');
const queueService = require('./queue');
const notificationService = require('../services/notificationService');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/cron.log' }),
    new winston.transports.Console()
  ]
});

class CronJobService {
  constructor() {
    this.jobs = new Map();
  }

  startAllJobs() {
    try {
      this.scheduleRecurringInvoiceJob();
      this.scheduleInvoiceReminderJob();
      this.scheduleOverdueInvoiceJob();
      this.scheduleNotificationRetryJob();
      this.scheduleQueueCleanupJob();
      this.scheduleStatisticsJob();

      logger.info('All cron jobs started successfully');
      return true;
    } catch (error) {
      logger.error('Failed to start cron jobs', { error: error.message });
      throw error;
    }
  }

  stopAllJobs() {
    for (const [name, job] of this.jobs) {
      job.stop();
      logger.info(`Stopped cron job: ${name}`);
    }
    this.jobs.clear();
  }

  startJob(name, schedule, task) {
    try {
      const job = cron.schedule(schedule, task, {
        scheduled: true,
        timezone: 'UTC'
      });

      this.jobs.set(name, job);
      logger.info(`Started cron job: ${name} with schedule: ${schedule}`);
      
      return job;
    } catch (error) {
      logger.error(`Failed to start cron job: ${name}`, { error: error.message });
      throw error;
    }
  }

  // Generate recurring invoices every day at 6 AM
  scheduleRecurringInvoiceJob() {
    this.startJob('generate-recurring-invoices', '0 6 * * *', async () => {
      try {
        logger.info('Running recurring invoice generation job');
        
        const count = await queueService.scheduleRecurringInvoices();
        
        logger.info(`Recurring invoice generation job completed. Scheduled ${count} invoices.`);
      } catch (error) {
        logger.error('Error in recurring invoice generation job', { error: error.message });
      }
    });
  }

  // Check for due invoices every day at 9 AM
  scheduleInvoiceReminderJob() {
    this.startJob('check-due-invoices', '0 9 * * *', async () => {
      try {
        logger.info('Running due invoice reminder job');
        
        const processedCount = await queueService.checkDueInvoices();
        
        logger.info(`Due invoice reminder job completed. Processed ${processedCount} invoices.`);
      } catch (error) {
        logger.error('Error in due invoice reminder job', { error: error.message });
      }
    });
  }

  // Check for overdue invoices every day at 10 AM
  scheduleOverdueInvoiceJob() {
    this.startJob('check-overdue-invoices', '0 10 * * *', async () => {
      try {
        logger.info('Running overdue invoice job');
        
        const processedCount = await queueService.checkDueInvoices();
        
        logger.info(`Overdue invoice job completed. Processed ${processedCount} invoices.`);
      } catch (error) {
        logger.error('Error in overdue invoice job', { error: error.message });
      }
    });
  }

  // Retry failed notifications every 30 minutes
  scheduleNotificationRetryJob() {
    this.startJob('retry-failed-notifications', '*/30 * * * *', async () => {
      try {
        logger.info('Running failed notification retry job');
        
        const results = await notificationService.retryFailedNotifications();
        
        const successfulRetries = results.filter(r => r.success).length;
        const failedRetries = results.filter(r => !r.success).length;
        
        logger.info('Notification retry job completed', {
          total: results.length,
          successful: successfulRetries,
          failed: failedRetries
        });
      } catch (error) {
        logger.error('Error in notification retry job', { error: error.message });
      }
    });
  }

  // Clean old queue jobs every Sunday at 2 AM
  scheduleQueueCleanupJob() {
    this.startJob('cleanup-queue-jobs', '0 2 * * 0', async () => {
      try {
        logger.info('Running queue cleanup job');
        
        const results = await queueService.cleanOldJobs(7); // Clean jobs older than 7 days
        
        logger.info('Queue cleanup job completed', results);
      } catch (error) {
        logger.error('Error in queue cleanup job', { error: error.message });
      }
    });
  }

  // Generate statistics and health checks every hour
  scheduleStatisticsJob() {
    this.startJob('generate-statistics', '0 * * * *', async () => {
      try {
        logger.info('Running statistics job');
        
        // Update invoice status (mark overdue)
        await this.updateOverdueInvoices();
        
        // Generate basic statistics
        await this.generateStatistics();
        
        logger.info('Statistics job completed');
      } catch (error) {
        logger.error('Error in statistics job', { error: error.message });
      }
    });
  }

  // Update invoice status to overdue
  async updateOverdueInvoices() {
    try {
      const Invoice = require('../models/Invoice');
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const result = await Invoice.updateMany(
        {
          status: { $in: ['sent', 'viewed'] },
          dueDate: { $lt: today }
        },
        {
          $set: { status: 'overdue' }
        }
      );
      
      if (result.modifiedCount > 0) {
        logger.info(`Updated ${result.modifiedCount} invoices to overdue status`);
      }
    } catch (error) {
      logger.error('Error updating overdue invoices', { error: error.message });
    }
  }

  // Generate and log basic statistics
  async generateStatistics() {
    try {
      const Invoice = require('../models/Invoice');
      const Client = require('../models/Client');
      const NotificationHistory = require('../models/NotificationHistory');
      
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      // Invoice statistics
      const invoiceStats = await Invoice.aggregate([
        {
          $match: {
            createdAt: { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: '$totalAmount' }
          }
        }
      ]);
      
      // Client statistics
      const clientStats = await Client.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);
      
      // Notification statistics
      const notificationStats = await notificationService.getNotificationStats(
        thirtyDaysAgo,
        now
      );
      
      // Log statistics
      logger.info('System statistics', {
        period: '30 days',
        invoices: invoiceStats,
        clients: clientStats,
        notifications: notificationStats
      });
      
      return {
        invoices: invoiceStats,
        clients: clientStats,
        notifications: notificationStats
      };
    } catch (error) {
      logger.error('Error generating statistics', { error: error.message });
      return null;
    }
  }

  // Manual job triggers (for testing)
  async triggerRecurringInvoiceGeneration() {
    try {
      logger.info('Manually triggering recurring invoice generation');
      const count = await queueService.scheduleRecurringInvoices();
      return { success: true, count };
    } catch (error) {
      logger.error('Manual recurring invoice trigger failed', { error: error.message });
      throw error;
    }
  }

  async triggerDueInvoiceCheck() {
    try {
      logger.info('Manually triggering due invoice check');
      const count = await queueService.checkDueInvoices();
      return { success: true, count };
    } catch (error) {
      logger.error('Manual due invoice trigger failed', { error: error.message });
      throw error;
    }
  }

  async triggerNotificationRetry() {
    try {
      logger.info('Manually triggering notification retry');
      const results = await notificationService.retryFailedNotifications();
      return { success: true, results };
    } catch (error) {
      logger.error('Manual notification retry trigger failed', { error: error.message });
      throw error;
    }
  }

  // Get job status
  getJobStatus() {
    const status = {};
    for (const [name, job] of this.jobs) {
      status[name] = {
        running: job.running,
        scheduled: job.scheduled
      };
    }
    return status;
  }

  // Restart specific job
  restartJob(name) {
    const oldJob = this.jobs.get(name);
    if (oldJob) {
      oldJob.stop();
      this.jobs.delete(name);
    }

    switch (name) {
      case 'generate-recurring-invoices':
        this.scheduleRecurringInvoiceJob();
        break;
      case 'check-due-invoices':
        this.scheduleInvoiceReminderJob();
        break;
      case 'check-overdue-invoices':
        this.scheduleOverdueInvoiceJob();
        break;
      case 'retry-failed-notifications':
        this.scheduleNotificationRetryJob();
        break;
      case 'cleanup-queue-jobs':
        this.scheduleQueueCleanupJob();
        break;
      case 'generate-statistics':
        this.scheduleStatisticsJob();
        break;
      default:
        throw new Error(`Unknown job: ${name}`);
    }
  }
}

module.exports = new CronJobService();
