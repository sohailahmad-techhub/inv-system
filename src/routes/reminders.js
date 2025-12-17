const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const Reminder = require('../models/Reminder');
const Client = require('../models/Client');
const Invoice = require('../models/Invoice');
const queueService = require('../jobs/queue');
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

// Create reminder rule
router.post('/', auth, [
  body('name').notEmpty().withMessage('Reminder name is required'),
  body('clientId').isMongoId().withMessage('Valid client ID is required'),
  body('invoiceId').optional().isMongoId().withMessage('Invoice ID must be valid'),
  body('type').isIn(['due', 'overdue']).withMessage('Type must be either "due" or "overdue"'),
  body('daysBeforeDue').optional().isInt({ min: 0, max: 365 }).withMessage('Days before due must be between 0-365'),
  body('channels').isObject().withMessage('Channels configuration is required'),
  body('channels.email').optional().isBoolean().withMessage('Email channel must be boolean'),
  body('channels.sms').optional().isBoolean().withMessage('SMS channel must be boolean'),
  body('channels.whatsapp').optional().isBoolean().withMessage('WhatsApp channel must be boolean')
], handleValidationErrors, async (req, res) => {
  try {
    const {
      name,
      clientId,
      invoiceId,
      type,
      daysBeforeDue = 0,
      template,
      channels,
      active = true
    } = req.body;

    // Verify client exists
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Verify invoice exists if provided
    if (invoiceId) {
      const invoice = await Invoice.findById(invoiceId);
      if (!invoice) {
        return res.status(404).json({
          success: false,
          message: 'Invoice not found'
        });
      }
    }

    // Validate at least one channel is enabled
    const enabledChannels = Object.keys(channels).filter(key => channels[key]);
    if (enabledChannels.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one notification channel must be enabled'
      });
    }

    // Check for existing reminder rules
    const existingReminder = await Reminder.findOne({
      clientId,
      invoiceId: invoiceId || null,
      type,
      active: true
    });

    if (existingReminder) {
      return res.status(400).json({
        success: false,
        message: `An active ${type} reminder already exists for this client${invoiceId ? ' and invoice' : ''}`
      });
    }

    const reminder = new Reminder({
      name,
      clientId,
      invoiceId,
      type,
      daysBeforeDue,
      template,
      channels,
      active,
      createdBy: req.user.id // Assuming auth middleware sets req.user
    });

    await reminder.save();

    // Send immediate test reminder if it's an overdue reminder and invoice is overdue
    if (type === 'overdue' && invoiceId) {
      const invoice = await Invoice.findById(invoiceId);
      if (invoice && invoice.dueDate < new Date()) {
        try {
          await notificationService.sendInvoiceReminder(invoice, client, 'overdue');
        } catch (error) {
          console.error('Failed to send immediate overdue reminder:', error);
        }
      }
    }

    res.status(201).json({
      success: true,
      message: 'Reminder rule created successfully',
      data: reminder
    });

  } catch (error) {
    console.error('Create reminder error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create reminder rule',
      error: error.message
    });
  }
});

// List reminders with pagination and filtering
router.get('/', auth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1-100'),
  query('active').optional().isBoolean().withMessage('Active must be a boolean'),
  query('type').optional().isIn(['due', 'overdue']).withMessage('Type must be "due" or "overdue"'),
  query('clientId').optional().isMongoId().withMessage('Client ID must be valid'),
  query('invoiceId').optional().isMongoId().withMessage('Invoice ID must be valid')
], handleValidationErrors, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      active,
      type,
      clientId,
      invoiceId,
      search
    } = req.query;

    // Build filter
    const filter = {};
    if (active !== undefined) filter.active = active === 'true';
    if (type) filter.type = type;
    if (clientId) filter.clientId = clientId;
    if (invoiceId) filter.invoiceId = invoiceId;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'template.subject': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const [reminders, total] = await Promise.all([
      Reminder.find(filter)
        .populate('clientId', 'name email company')
        .populate('invoiceId', 'invoiceNumber totalAmount dueDate status')
        .populate('sentReminders.notificationId', 'status sentAt channel')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Reminder.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        reminders,
        pagination: {
          current: parseInt(page),
          total: totalPages,
          count: reminders.length,
          totalRecords: total
        }
      }
    });

  } catch (error) {
    console.error('List reminders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reminders',
      error: error.message
    });
  }
});

// Get single reminder
router.get('/:id', auth, [
  param('id').isMongoId().withMessage('Valid reminder ID is required')
], handleValidationErrors, async (req, res) => {
  try {
    const reminder = await Reminder.findById(req.params.id)
      .populate('clientId', 'name email company phone whatsapp address')
      .populate('invoiceId')
      .populate('sentReminders.notificationId');

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found'
      });
    }

    res.json({
      success: true,
      data: reminder
    });

  } catch (error) {
    console.error('Get reminder error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reminder',
      error: error.message
    });
  }
});

// Update reminder
router.put('/:id', auth, [
  param('id').isMongoId().withMessage('Valid reminder ID is required'),
  body('name').optional().notEmpty().withMessage('Name cannot be empty'),
  body('type').optional().isIn(['due', 'overdue']).withMessage('Type must be "due" or "overdue"'),
  body('daysBeforeDue').optional().isInt({ min: 0, max: 365 }).withMessage('Days before due must be between 0-365'),
  body('channels').optional().isObject().withMessage('Channels must be an object'),
  body('template').optional().isObject().withMessage('Template must be an object'),
  body('active').optional().isBoolean().withMessage('Active must be boolean')
], handleValidationErrors, async (req, res) => {
  try {
    const reminder = await Reminder.findById(req.params.id);

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found'
      });
    }

    // Update fields
    const allowedUpdates = ['name', 'type', 'daysBeforeDue', 'channels', 'template', 'active'];
    
    for (const field of allowedUpdates) {
      if (req.body[field] !== undefined) {
        reminder[field] = req.body[field];
      }
    }

    // Validate at least one channel is enabled
    if (req.body.channels) {
      const enabledChannels = Object.keys(reminder.channels).filter(key => reminder.channels[key]);
      if (enabledChannels.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one notification channel must be enabled'
        });
      }
    }

    await reminder.save();

    res.json({
      success: true,
      message: 'Reminder updated successfully',
      data: reminder
    });

  } catch (error) {
    console.error('Update reminder error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update reminder',
      error: error.message
    });
  }
});

// Delete reminder
router.delete('/:id', auth, [
  param('id').isMongoId().withMessage('Valid reminder ID is required')
], handleValidationErrors, async (req, res) => {
  try {
    const reminder = await Reminder.findById(req.params.id);

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found'
      });
    }

    await Reminder.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Reminder deleted successfully'
    });

  } catch (error) {
    console.error('Delete reminder error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete reminder',
      error: error.message
    });
  }
});

// Test reminder
router.post('/:id/test', auth, [
  param('id').isMongoId().withMessage('Valid reminder ID is required')
], handleValidationErrors, async (req, res) => {
  try {
    const reminder = await Reminder.findById(req.params.id)
      .populate('clientId')
      .populate('invoiceId');

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found'
      });
    }

    if (!reminder.invoiceId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot test reminder without associated invoice'
      });
    }

    const enabledChannels = Object.keys(reminder.channels).filter(key => reminder.channels[key]);
    
    if (enabledChannels.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No notification channels enabled for this reminder'
      });
    }

    // Send test notification
    const results = [];
    
    for (const channel of enabledChannels) {
      try {
        let result;
        
        if (channel === 'email') {
          result = await notificationService.emailService.sendEmail(
            reminder.clientId.email,
            `TEST: ${reminder.template?.subject || 'Invoice Reminder'}`,
            reminder.template?.message || 'This is a test reminder notification.'
          );
        } else if (channel === 'sms' && reminder.clientId.phone) {
          result = await notificationService.smsService.sendSMS(
            reminder.clientId.phone,
            'This is a test reminder notification.'
          );
        } else if (channel === 'whatsapp' && reminder.clientId.whatsapp) {
          result = await notificationService.whatsappService.sendWhatsApp(
            reminder.clientId.whatsapp,
            'This is a test reminder notification.'
          );
        }
        
        if (result) {
          results.push({ channel, success: true, messageId: result.messageId });
        }
      } catch (error) {
        results.push({ channel, success: false, error: error.message });
      }
    }

    res.json({
      success: true,
      message: 'Test reminder sent',
      data: {
        results,
        totalSent: results.filter(r => r.success).length,
        totalFailed: results.filter(r => !r.success).length
      }
    });

  } catch (error) {
    console.error('Test reminder error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test reminder',
      error: error.message
    });
  }
});

// Toggle reminder active status
router.patch('/:id/toggle', auth, [
  param('id').isMongoId().withMessage('Valid reminder ID is required')
], handleValidationErrors, async (req, res) => {
  try {
    const reminder = await Reminder.findById(req.params.id);

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found'
      });
    }

    reminder.active = !reminder.active;
    await reminder.save();

    res.json({
      success: true,
      message: `Reminder ${reminder.active ? 'activated' : 'deactivated'} successfully`,
      data: {
        active: reminder.active
      }
    });

  } catch (error) {
    console.error('Toggle reminder error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle reminder status',
      error: error.message
    });
  }
});

// Get reminder statistics
router.get('/:id/stats', auth, [
  param('id').isMongoId().withMessage('Valid reminder ID is required')
], handleValidationErrors, async (req, res) => {
  try {
    const reminder = await Reminder.findById(req.params.id);

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found'
      });
    }

    const sentReminders = reminder.sentReminders || [];
    const totalSent = sentReminders.length;
    const successfulReminders = sentReminders.filter(rem => rem.notificationId).length;
    
    // Calculate channel breakdown
    const channelStats = sentReminders.reduce((acc, rem) => {
      acc[rem.channel] = (acc[rem.channel] || 0) + 1;
      return acc;
    }, {});

    // Calculate recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentReminders = sentReminders.filter(rem => 
      rem.sentAt && new Date(rem.sentAt) >= thirtyDaysAgo
    );

    const stats = {
      reminder: {
        name: reminder.name,
        type: reminder.type,
        active: reminder.active
      },
      summary: {
        totalSent,
        successfulReminders,
        successRate: totalSent > 0 ? (successfulReminders / totalSent * 100).toFixed(2) : 0,
        recentReminders: recentReminders.length
      },
      channels: channelStats,
      lastSent: sentReminders.length > 0 ? 
        sentReminders[sentReminders.length - 1].sentAt : null
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get reminder stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reminder statistics',
      error: error.message
    });
  }
});

// Get reminders due for sending (for cron job use)
router.get('/admin/due-for-sending', auth, [
  query('hours').optional().isInt({ min: 1, max: 24 }).withMessage('Hours must be between 1-24')
], handleValidationErrors, async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() + parseInt(hours));
    
    const dueInvoices = await Invoice.find({
      status: { $in: ['sent', 'viewed'] },
      dueDate: { $lte: cutoffTime },
      createdAt: { $lte: cutoffTime }
    });

    const dueReminders = [];
    
    for (const invoice of dueInvoices) {
      const reminders = await Reminder.find({
        invoiceId: invoice._id,
        active: true
      });
      
      dueReminders.push(...reminders);
    }

    res.json({
      success: true,
      data: {
        reminders: dueReminders,
        count: dueReminders.length,
        cutoffTime
      }
    });

  } catch (error) {
    console.error('Get due reminders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch due reminders',
      error: error.message
    });
  }
});

module.exports = router;
