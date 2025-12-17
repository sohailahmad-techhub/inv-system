const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const RecurringInvoice = require('../models/RecurringInvoice');
const Client = require('../models/Client');
const queueService = require('../jobs/queue');
const { auth, adminOrOwner } = require('../middleware/auth');
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

// Create recurring invoice template
router.post('/', auth, [
  body('name').notEmpty().withMessage('Template name is required'),
  body('clientId').isMongoId().withMessage('Valid client ID is required'),
  body('frequency').isIn(['weekly', 'monthly', 'quarterly', 'yearly']).withMessage('Invalid frequency'),
  body('invoiceTemplate').isObject().withMessage('Invoice template is required'),
  body('invoiceTemplate.items').isArray().withMessage('Items array is required'),
  body('paymentTerms').optional().isInt({ min: 1, max: 365 }).withMessage('Payment terms must be between 1-365 days'),
  body('nextDate').isISO8601().withMessage('Next date must be a valid date'),
  body('endDate').optional().isISO8601().withMessage('End date must be a valid date')
], handleValidationErrors, async (req, res) => {
  try {
    const {
      name,
      clientId,
      clientEmail,
      clientPhone,
      clientWhatsApp,
      invoiceTemplate,
      frequency,
      nextDate,
      endDate,
      paymentTerms = 30
    } = req.body;

    // Verify client exists
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Validate invoice template
    if (!invoiceTemplate.items || invoiceTemplate.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invoice template must contain at least one item'
      });
    }

    // Calculate totals
    const subtotal = invoiceTemplate.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const totalAmount = subtotal + (invoiceTemplate.taxAmount || 0) - (invoiceTemplate.discountAmount || 0);

    // Update invoice template with calculated values
    const updatedInvoiceTemplate = {
      ...invoiceTemplate,
      subtotal,
      totalAmount
    };

    const recurringInvoice = new RecurringInvoice({
      name,
      clientId,
      clientEmail: clientEmail || client.email,
      clientPhone: clientPhone || client.phone,
      clientWhatsApp: clientWhatsApp || client.whatsapp,
      invoiceTemplate: updatedInvoiceTemplate,
      frequency,
      nextDate,
      endDate,
      paymentTerms,
      createdBy: req.user.id // Assuming auth middleware sets req.user
    });

    await recurringInvoice.save();

    res.status(201).json({
      success: true,
      message: 'Recurring invoice template created successfully',
      data: recurringInvoice
    });

  } catch (error) {
    console.error('Create recurring invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create recurring invoice template',
      error: error.message
    });
  }
});

// List recurring invoices with pagination and filtering
router.get('/', auth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1-100'),
  query('active').optional().isBoolean().withMessage('Active must be a boolean'),
  query('frequency').optional().isIn(['weekly', 'monthly', 'quarterly', 'yearly']).withMessage('Invalid frequency'),
  query('clientId').optional().isMongoId().withMessage('Client ID must be valid')
], handleValidationErrors, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      active,
      frequency,
      clientId,
      search
    } = req.query;

    // Build filter
    const filter = {};
    if (active !== undefined) filter.active = active === 'true';
    if (frequency) filter.frequency = frequency;
    if (clientId) filter.clientId = clientId;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { clientEmail: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const [recurringInvoices, total] = await Promise.all([
      RecurringInvoice.find(filter)
        .populate('clientId', 'name email company')
        .populate('generatedInvoices', 'invoiceNumber totalAmount dueDate status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      RecurringInvoice.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        recurringInvoices,
        pagination: {
          current: parseInt(page),
          total: totalPages,
          count: recurringInvoices.length,
          totalRecords: total
        }
      }
    });

  } catch (error) {
    console.error('List recurring invoices error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recurring invoices',
      error: error.message
    });
  }
});

// Get single recurring invoice
router.get('/:id', auth, [
  param('id').isMongoId().withMessage('Valid recurring invoice ID is required')
], handleValidationErrors, async (req, res) => {
  try {
    const recurringInvoice = await RecurringInvoice.findById(req.params.id)
      .populate('clientId', 'name email company phone whatsapp address')
      .populate('generatedInvoices');

    if (!recurringInvoice) {
      return res.status(404).json({
        success: false,
        message: 'Recurring invoice template not found'
      });
    }

    res.json({
      success: true,
      data: recurringInvoice
    });

  } catch (error) {
    console.error('Get recurring invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recurring invoice',
      error: error.message
    });
  }
});

// Update recurring invoice
router.put('/:id', auth, [
  param('id').isMongoId().withMessage('Valid recurring invoice ID is required'),
  body('name').optional().notEmpty().withMessage('Template name cannot be empty'),
  body('frequency').optional().isIn(['weekly', 'monthly', 'quarterly', 'yearly']).withMessage('Invalid frequency'),
  body('invoiceTemplate').optional().isObject().withMessage('Invoice template must be an object'),
  body('invoiceTemplate.items').optional().isArray().withMessage('Items must be an array'),
  body('paymentTerms').optional().isInt({ min: 1, max: 365 }).withMessage('Payment terms must be between 1-365 days'),
  body('nextDate').optional().isISO8601().withMessage('Next date must be a valid date'),
  body('endDate').optional().isISO8601().withMessage('End date must be a valid date'),
  body('active').optional().isBoolean().withMessage('Active must be a boolean')
], handleValidationErrors, async (req, res) => {
  try {
    const recurringInvoice = await RecurringInvoice.findById(req.params.id);

    if (!recurringInvoice) {
      return res.status(404).json({
        success: false,
        message: 'Recurring invoice template not found'
      });
    }

    // Update fields
    const allowedUpdates = [
      'name', 'frequency', 'nextDate', 'endDate', 
      'paymentTerms', 'active', 'invoiceTemplate',
      'clientEmail', 'clientPhone', 'clientWhatsApp'
    ];

    for (const field of allowedUpdates) {
      if (req.body[field] !== undefined) {
        recurringInvoice[field] = req.body[field];
      }
    }

    // Recalculate totals if invoice template was updated
    if (req.body.invoiceTemplate) {
      const items = req.body.invoiceTemplate.items || recurringInvoice.invoiceTemplate.items;
      const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
      const taxAmount = req.body.invoiceTemplate.taxAmount || recurringInvoice.invoiceTemplate.taxAmount || 0;
      const discountAmount = req.body.invoiceTemplate.discountAmount || recurringInvoice.invoiceTemplate.discountAmount || 0;
      
      recurringInvoice.invoiceTemplate.subtotal = subtotal;
      recurringInvoice.invoiceTemplate.totalAmount = subtotal + taxAmount - discountAmount;
    }

    await recurringInvoice.save();

    res.json({
      success: true,
      message: 'Recurring invoice template updated successfully',
      data: recurringInvoice
    });

  } catch (error) {
    console.error('Update recurring invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update recurring invoice template',
      error: error.message
    });
  }
});

// Delete recurring invoice
router.delete('/:id', auth, [
  param('id').isMongoId().withMessage('Valid recurring invoice ID is required')
], handleValidationErrors, async (req, res) => {
  try {
    const recurringInvoice = await RecurringInvoice.findById(req.params.id);

    if (!recurringInvoice) {
      return res.status(404).json({
        success: false,
        message: 'Recurring invoice template not found'
      });
    }

    // Check if template has generated invoices
    if (recurringInvoice.generatedInvoices.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete template with generated invoices. Please deactivate instead.'
      });
    }

    await RecurringInvoice.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Recurring invoice template deleted successfully'
    });

  } catch (error) {
    console.error('Delete recurring invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete recurring invoice template',
      error: error.message
    });
  }
});

// Generate invoice manually
router.post('/:id/generate', auth, [
  param('id').isMongoId().withMessage('Valid recurring invoice ID is required')
], handleValidationErrors, async (req, res) => {
  try {
    const recurringInvoice = await RecurringInvoice.findById(req.params.id);

    if (!recurringInvoice) {
      return res.status(404).json({
        success: false,
        message: 'Recurring invoice template not found'
      });
    }

    if (!recurringInvoice.active) {
      return res.status(400).json({
        success: false,
        message: 'Cannot generate invoice from inactive template'
      });
    }

    // Add to queue
    const job = await queueService.addRecurringInvoiceJob({
      templateId: recurringInvoice._id,
      templateName: recurringInvoice.name
    });

    res.json({
      success: true,
      message: 'Invoice generation queued successfully',
      data: {
        jobId: job.id,
        templateName: recurringInvoice.name
      }
    });

  } catch (error) {
    console.error('Generate invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate invoice',
      error: error.message
    });
  }
});

// Get template statistics
router.get('/:id/stats', auth, [
  param('id').isMongoId().withMessage('Valid recurring invoice ID is required')
], handleValidationErrors, async (req, res) => {
  try {
    const recurringInvoice = await RecurringInvoice.findById(req.params.id)
      .populate('generatedInvoices', 'status totalAmount dueDate paidDate');

    if (!recurringInvoice) {
      return res.status(404).json({
        success: false,
        message: 'Recurring invoice template not found'
      });
    }

    // Calculate statistics
    const invoices = recurringInvoice.generatedInvoices;
    const totalGenerated = invoices.length;
    const totalPaid = invoices.filter(inv => inv.status === 'paid').length;
    const totalOutstanding = invoices.filter(inv => ['sent', 'viewed', 'overdue'].includes(inv.status)).length;
    const totalRevenue = invoices
      .filter(inv => inv.status === 'paid')
      .reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalOutstandingAmount = invoices
      .filter(inv => ['sent', 'viewed', 'overdue'].includes(inv.status))
      .reduce((sum, inv) => sum + inv.totalAmount, 0);

    const stats = {
      template: {
        name: recurringInvoice.name,
        frequency: recurringInvoice.frequency,
        nextDate: recurringInvoice.nextDate,
        active: recurringInvoice.active
      },
      invoices: {
        totalGenerated,
        totalPaid,
        totalOutstanding,
        paymentRate: totalGenerated > 0 ? (totalPaid / totalGenerated * 100).toFixed(2) : 0
      },
      revenue: {
        total: totalRevenue,
        totalOutstanding: totalOutstandingAmount,
        averageInvoiceValue: totalGenerated > 0 ? (totalRevenue / totalGenerated).toFixed(2) : 0
      }
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get template stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch template statistics',
      error: error.message
    });
  }
});

// Toggle active status
router.patch('/:id/toggle', auth, [
  param('id').isMongoId().withMessage('Valid recurring invoice ID is required')
], handleValidationErrors, async (req, res) => {
  try {
    const recurringInvoice = await RecurringInvoice.findById(req.params.id);

    if (!recurringInvoice) {
      return res.status(404).json({
        success: false,
        message: 'Recurring invoice template not found'
      });
    }

    recurringInvoice.active = !recurringInvoice.active;
    await recurringInvoice.save();

    res.json({
      success: true,
      message: `Template ${recurringInvoice.active ? 'activated' : 'deactivated'} successfully`,
      data: {
        active: recurringInvoice.active
      }
    });

  } catch (error) {
    console.error('Toggle recurring invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle template status',
      error: error.message
    });
  }
});

module.exports = router;
