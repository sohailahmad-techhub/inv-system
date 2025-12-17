const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const Client = require('../models/Client');
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

// Create client
router.post('/', auth, [
  body('name').notEmpty().withMessage('Client name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phone').optional().isString().withMessage('Phone must be a string'),
  body('whatsapp').optional().isString().withMessage('WhatsApp must be a string'),
  body('paymentTerms').optional().isInt({ min: 1, max: 365 }).withMessage('Payment terms must be between 1-365 days'),
  body('preferredContactMethod').optional().isIn(['email', 'sms', 'whatsapp', 'email_sms', 'email_whatsapp', 'all']).withMessage('Invalid contact method')
], handleValidationErrors, async (req, res) => {
  try {
    const client = new Client(req.body);
    await client.save();

    res.status(201).json({
      success: true,
      message: 'Client created successfully',
      data: client
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Client with this email already exists'
      });
    }
    
    console.error('Create client error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create client',
      error: error.message
    });
  }
});

// List clients with pagination and filtering
router.get('/', auth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1-100'),
  query('status').optional().isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status'),
  query('search').optional().isString().withMessage('Search must be a string')
], handleValidationErrors, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search
    } = req.query;

    // Build filter
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const [clients, total] = await Promise.all([
      Client.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Client.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        clients,
        pagination: {
          current: parseInt(page),
          total: totalPages,
          count: clients.length,
          totalRecords: total
        }
      }
    });

  } catch (error) {
    console.error('List clients error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch clients',
      error: error.message
    });
  }
});

// Get single client
router.get('/:id', auth, [
  param('id').isMongoId().withMessage('Valid client ID is required')
], handleValidationErrors, async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Get client statistics
    await client.updateStats();

    res.json({
      success: true,
      data: client
    });

  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch client',
      error: error.message
    });
  }
});

// Update client
router.put('/:id', auth, [
  param('id').isMongoId().withMessage('Valid client ID is required'),
  body('name').optional().notEmpty().withMessage('Name cannot be empty'),
  body('email').optional().isEmail().withMessage('Valid email is required'),
  body('phone').optional().isString().withMessage('Phone must be a string'),
  body('whatsapp').optional().isString().withMessage('WhatsApp must be a string'),
  body('paymentTerms').optional().isInt({ min: 1, max: 365 }).withMessage('Payment terms must be between 1-365 days'),
  body('preferredContactMethod').optional().isIn(['email', 'sms', 'whatsapp', 'email_sms', 'email_whatsapp', 'all']).withMessage('Invalid contact method')
], handleValidationErrors, async (req, res) => {
  try {
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    res.json({
      success: true,
      message: 'Client updated successfully',
      data: client
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Client with this email already exists'
      });
    }
    
    console.error('Update client error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update client',
      error: error.message
    });
  }
});

// Update client notification preferences
router.patch('/:id/notification-preferences', auth, [
  param('id').isMongoId().withMessage('Valid client ID is required'),
  body('notificationsEnabled').isObject().withMessage('Notification preferences must be an object'),
  body('notificationsEnabled.email').optional().isBoolean().withMessage('Email preference must be boolean'),
  body('notificationsEnabled.sms').optional().isBoolean().withMessage('SMS preference must be boolean'),
  body('notificationsEnabled.whatsapp').optional().isBoolean().withMessage('WhatsApp preference must be boolean'),
  body('preferredContactMethod').optional().isIn(['email', 'sms', 'whatsapp', 'email_sms', 'email_whatsapp', 'all']).withMessage('Invalid contact method')
], handleValidationErrors, async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Update notification preferences
    if (req.body.notificationsEnabled) {
      client.notificationsEnabled = {
        ...client.notificationsEnabled,
        ...req.body.notificationsEnabled
      };
    }

    if (req.body.preferredContactMethod) {
      client.preferredContactMethod = req.body.preferredContactMethod;
    }

    await client.save();

    res.json({
      success: true,
      message: 'Notification preferences updated successfully',
      data: {
        notificationsEnabled: client.notificationsEnabled,
        preferredContactMethod: client.preferredContactMethod
      }
    });

  } catch (error) {
    console.error('Update notification preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notification preferences',
      error: error.message
    });
  }
});

// Delete client
router.delete('/:id', auth, [
  param('id').isMongoId().withMessage('Valid client ID is required')
], handleValidationErrors, async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Check if client has invoices
    const Invoice = require('../models/Invoice');
    const invoiceCount = await Invoice.countDocuments({ clientId: req.params.id });

    if (invoiceCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete client with existing invoices. Please deactivate instead.'
      });
    }

    await Client.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Client deleted successfully'
    });

  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete client',
      error: error.message
    });
  }
});

// Get client statistics
router.get('/:id/stats', [
  param('id').isMongoId().withMessage('Valid client ID is required')
], handleValidationErrors, async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Get invoice statistics
    const Invoice = require('../models/Invoice');
    
    const invoiceStats = await Invoice.aggregate([
      { $match: { clientId: client._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' }
        }
      }
    ]);

    // Calculate totals
    const totalInvoices = invoiceStats.reduce((sum, stat) => sum + stat.count, 0);
    const totalRevenue = invoiceStats
      .filter(stat => stat._id === 'paid')
      .reduce((sum, stat) => sum + stat.totalAmount, 0);
    const outstandingAmount = invoiceStats
      .filter(stat => ['sent', 'viewed', 'overdue'].includes(stat._id))
      .reduce((sum, stat) => sum + stat.totalAmount, 0);

    // Get recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentInvoices = await Invoice.countDocuments({
      clientId: client._id,
      createdAt: { $gte: thirtyDaysAgo }
    });

    // Get notification statistics
    const NotificationHistory = require('../models/NotificationHistory');
    const notificationStats = await NotificationHistory.aggregate([
      { $match: { clientId: client._id } },
      {
        $group: {
          _id: {
            channel: '$channel',
            status: '$status'
          },
          count: { $sum: 1 }
        }
      }
    ]);

    const stats = {
      client: {
        name: client.name,
        email: client.email,
        company: client.company,
        status: client.status
      },
      invoices: {
        total: totalInvoices,
        paid: invoiceStats.find(stat => stat._id === 'paid')?.count || 0,
        outstanding: invoiceStats.filter(stat => ['sent', 'viewed', 'overdue'].includes(stat._id))
          .reduce((sum, stat) => sum + stat.count, 0),
        overdue: invoiceStats.find(stat => stat._id === 'overdue')?.count || 0,
        recent: recentInvoices
      },
      revenue: {
        total: totalRevenue,
        outstanding: outstandingAmount,
        averageInvoiceValue: totalInvoices > 0 ? (totalRevenue / totalInvoices).toFixed(2) : 0
      },
      notifications: notificationStats,
      lastActivity: client.updatedAt
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get client stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch client statistics',
      error: error.message
    });
  }
});

// Toggle client status
router.patch('/:id/toggle-status', [
  param('id').isMongoId().withMessage('Valid client ID is required')
], handleValidationErrors, async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    const statusFlow = {
      'active': 'inactive',
      'inactive': 'active',
      'suspended': 'active'
    };

    client.status = statusFlow[client.status] || 'inactive';
    await client.save();

    res.json({
      success: true,
      message: `Client status changed to ${client.status}`,
      data: {
        status: client.status
      }
    });

  } catch (error) {
    console.error('Toggle client status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle client status',
      error: error.message
    });
  }
});

module.exports = router;
