const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const NotificationHistory = require('../models/NotificationHistory');
const notificationService = require('../services/notificationService');
const { auth } = require('../middleware/auth');
const router = express.Router();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Get notification history with pagination and filtering
router.get('/history', auth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1-100'),
  query('status').optional().isIn(['pending', 'sent', 'delivered', 'failed', 'bounced']).withMessage('Invalid status'),
  query('channel').optional().isIn(['email', 'sms', 'whatsapp']).withMessage('Invalid channel'),
  query('type').optional().isIn(['invoice_reminder', 'payment_reminder', 'overdue_notice', 'recurring_invoice_created']).withMessage('Invalid type'),
  query('clientId').optional().isMongoId().withMessage('Client ID must be valid'),
  query('invoiceId').optional().isMongoId().withMessage('Invoice ID must be valid')
], handleValidationErrors, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      channel,
      type,
      clientId,
      invoiceId,
      startDate,
      endDate
    } = req.query;

    // Build filter
    const filter = {};
    if (status) filter.status = status;
    if (channel) filter.channel = channel;
    if (type) filter.type = type;
    if (clientId) filter.clientId = clientId;
    if (invoiceId) filter.invoiceId = invoiceId;
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      NotificationHistory.find(filter)
        .populate('clientId', 'name email company')
        .populate('invoiceId', 'invoiceNumber totalAmount dueDate status')
        .populate('reminderId', 'name type')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      NotificationHistory.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          current: parseInt(page),
          total: totalPages,
          count: notifications.length,
          totalRecords: total
        }
      }
    });

  } catch (error) {
    console.error('Get notification history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification history',
      error: error.message
    });
  }
});

// Get single notification
router.get('/history/:id', auth, [
  param('id').isMongoId().withMessage('Valid notification ID is required')
], handleValidationErrors, async (req, res) => {
  try {
    const notification = await NotificationHistory.findById(req.params.id)
      .populate('clientId', 'name email company phone whatsapp')
      .populate('invoiceId')
      .populate('reminderId');

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      data: notification
    });

  } catch (error) {
    console.error('Get notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification',
      error: error.message
    });
  }
});

// Retry failed notification
router.post('/history/:id/retry', auth, [
  param('id').isMongoId().withMessage('Valid notification ID is required')
], handleValidationErrors, async (req, res) => {
  try {
    const notification = await NotificationHistory.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    if (notification.status !== 'failed') {
      return res.status(400).json({
        success: false,
        message: 'Only failed notifications can be retried'
      });
    }

    if (!notification.shouldRetry()) {
      return res.status(400).json({
        success: false,
        message: 'Notification has exceeded maximum retry attempts'
      });
    }

    // Get fresh invoice and client data
    const Invoice = require('../models/Invoice');
    const Client = require('../models/Client');
    
    const invoice = await Invoice.findById(notification.invoiceId);
    const client = await Client.findById(notification.clientId);
    
    if (!invoice || !client) {
      return res.status(404).json({
        success: false,
        message: 'Invoice or client not found'
      });
    }

    const template = notificationService.getReminderTemplate(
      notification.type.replace('invoice_', ''),
      invoice,
      client
    );

    await notificationService.sendSingleNotification({
      invoice,
      client,
      type: notification.type,
      channel: notification.channel,
      reminderId: notification.reminderId,
      template
    });

    res.json({
      success: true,
      message: 'Notification retry queued successfully'
    });

  } catch (error) {
    console.error('Retry notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retry notification',
      error: error.message
    });
  }
});

// Get notification statistics
router.get('/stats', auth, [
  query('startDate').optional().isISO8601().withMessage('Start date must be valid'),
  query('endDate').optional().isISO8601().withMessage('End date must be valid')
], handleValidationErrors, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const stats = await notificationService.getNotificationStats(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    // Calculate additional statistics
    const NotificationHistory = require('../models/NotificationHistory');
    
    const overallStats = await NotificationHistory.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            $lte: endDate ? new Date(endDate) : new Date()
          }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Calculate success rate
    const totalNotifications = overallStats.reduce((sum, stat) => sum + stat.count, 0);
    const successfulNotifications = overallStats
      .filter(stat => ['sent', 'delivered'].includes(stat._id))
      .reduce((sum, stat) => sum + stat.count, 0);
    
    const successRate = totalNotifications > 0 ? 
      (successfulNotifications / totalNotifications * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        overview: {
          total: totalNotifications,
          successful: successfulNotifications,
          failed: totalNotifications - successfulNotifications,
          successRate: parseFloat(successRate)
        },
        byChannel: stats,
        byStatus: overallStats
      }
    });

  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification statistics',
      error: error.message
    });
  }
});

// Send manual notification
router.post('/send', auth, [
  body('invoiceId').isMongoId().withMessage('Valid invoice ID is required'),
  body('clientId').isMongoId().withMessage('Valid client ID is required'),
  body('type').isIn(['invoice_reminder', 'payment_reminder', 'overdue_notice', 'recurring_invoice_created']).withMessage('Invalid notification type'),
  body('channels').isArray().withMessage('Channels must be an array'),
  body('channels.*').isIn(['email', 'sms', 'whatsapp']).withMessage('Invalid channel'),
  body('message').optional().isString().withMessage('Message must be a string'),
  body('subject').optional().isString().withMessage('Subject must be a string')
], handleValidationErrors, async (req, res) => {
  try {
    const {
      invoiceId,
      clientId,
      type,
      channels,
      message,
      subject
    } = req.body;

    // Verify invoice and client exist
    const Invoice = require('../models/Invoice');
    const Client = require('../models/Client');
    
    const [invoice, client] = await Promise.all([
      Invoice.findById(invoiceId),
      Client.findById(clientId)
    ]);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Create template
    const reminderType = type.replace('invoice_', '');
    const template = message && subject ? 
      { message, subject } :
      notificationService.getReminderTemplate(reminderType, invoice, client);

    // Send notification
    const results = await notificationService.sendNotification({
      invoice,
      client,
      type,
      channels,
      template
    });

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      success: true,
      message: 'Manual notification sent',
      data: {
        results,
        summary: {
          total: results.length,
          successful,
          failed
        }
      }
    });

  } catch (error) {
    console.error('Send manual notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send manual notification',
      error: error.message
    });
  }
});

// Retry all failed notifications
router.post('/retry-failed', auth, [
  body('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1-100')
], handleValidationErrors, async (req, res) => {
  try {
    const { limit = 10 } = req.body;

    const failedNotifications = await NotificationHistory.find({
      status: 'failed',
      retryCount: { $lt: 3 },
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
    }).limit(limit);

    const results = [];
    
    for (const notification of failedNotifications) {
      try {
        // Get fresh invoice and client data
        const Invoice = require('../models/Invoice');
        const Client = require('../models/Client');
        
        const invoice = await Invoice.findById(notification.invoiceId);
        const client = await Client.findById(notification.clientId);
        
        if (!invoice || !client) {
          results.push({
            notificationId: notification._id,
            success: false,
            reason: 'Invoice or client not found'
          });
          continue;
        }

        const template = notificationService.getReminderTemplate(
          notification.type.replace('invoice_', ''),
          invoice,
          client
        );

        await notificationService.sendSingleNotification({
          invoice,
          client,
          type: notification.type,
          channel: notification.channel,
          reminderId: notification.reminderId,
          template
        });

        results.push({
          notificationId: notification._id,
          success: true
        });

      } catch (error) {
        results.push({
          notificationId: notification._id,
          success: false,
          error: error.message
        });
      }
    }

    const successful = results.filter(r => r.success).length;

    res.json({
      success: true,
      message: `Retry completed: ${successful}/${results.length} notifications retried successfully`,
      data: {
        results,
        summary: {
          total: results.length,
          successful,
          failed: results.length - successful
        }
      }
    });

  } catch (error) {
    console.error('Retry failed notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retry failed notifications',
      error: error.message
    });
  }
});

// Get notification delivery status
router.get('/delivery-status/:messageId', auth, [
  param('messageId').notEmpty().withMessage('Message ID is required')
], handleValidationErrors, async (req, res) => {
  try {
    const notification = await NotificationHistory.findOne({
      'metadata.messageId': req.params.messageId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      data: {
        messageId: req.params.messageId,
        status: notification.status,
        channel: notification.channel,
        sentAt: notification.sentAt,
        deliveredAt: notification.deliveredAt,
        failedAt: notification.failedAt,
        retryCount: notification.retryCount,
        errorMessage: notification.errorMessage
      }
    });

  } catch (error) {
    console.error('Get delivery status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch delivery status',
      error: error.message
    });
  }
});

module.exports = router;
