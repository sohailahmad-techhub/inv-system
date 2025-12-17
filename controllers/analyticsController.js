const asyncHandler = require('express-async-handler');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const User = require('../models/User');

// GET /clients/:id/analytics
const getClientAnalytics = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { startDate, endDate } = req.query;

  // Verify client exists
  const client = await User.findOne({ _id: id, role: 'CLIENT' });
  if (!client) {
    return res.status(404).json({
      success: false,
      message: 'Client not found'
    });
  }

  // Build date filter
  let dateFilter = { clientId: id };
  if (startDate && endDate) {
    dateFilter.issueDate = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  // Total invoices count
  const totalInvoices = await Invoice.countDocuments({
    ...dateFilter,
    isDeleted: false
  });

  // Total revenue from client
  const revenueData = await Payment.aggregate([
    {
      $match: {
        clientId: id,
        status: 'COMPLETED',
        isDeleted: false
      }
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$netAmount' },
        averagePayment: { $avg: '$netAmount' }
      }
    },
    {
      $project: {
        _id: 0,
        totalRevenue: { $round: ['$totalRevenue', 2] },
        averagePayment: { $round: ['$averagePayment', 2] }
      }
    }
  ]);

  // Average invoice value
  const invoiceStats = await Invoice.aggregate([
    {
      $match: {
        ...dateFilter,
        isDeleted: false
      }
    },
    {
      $group: {
        _id: null,
        totalValue: { $sum: '$total' },
        averageValue: { $avg: '$total' },
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        totalValue: { $round: ['$totalValue', 2] },
        averageValue: { $round: ['$averageValue', 2] },
        count: 1
      }
    }
  ]);

  // Outstanding balance
  const outstandingInvoices = await Invoice.aggregate([
    {
      $match: {
        clientId: id,
        status: { $in: ['SENT', 'OVERDUE'] },
        isDeleted: false
      }
    },
    {
      $group: {
        _id: null,
        outstandingBalance: { $sum: '$total' },
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        outstandingBalance: { $round: ['$outstandingBalance', 2] },
        count: 1
      }
    }
  ]);

  // Payment history (last 12 months)
  const paymentHistory = await Payment.aggregate([
    {
      $match: {
        clientId: id,
        status: 'COMPLETED',
        isDeleted: false
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$paymentDate' },
          month: { $month: '$paymentDate' }
        },
        amount: { $sum: '$netAmount' },
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        period: { $concat: [{ $toString: '$_id.year' }, '-', { $toString: '$_id.month' }] },
        amount: { $round: ['$amount', 2] },
        count: 1,
        _id: 0
      }
    },
    { $sort: { period: -1 } },
    { $limit: 12 }
  ]);

  // Invoice status breakdown
  const invoiceStatus = await Invoice.aggregate([
    {
      $match: {
        clientId: id,
        isDeleted: false
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalValue: { $sum: '$total' }
      }
    },
    {
      $project: {
        status: '$_id',
        count: 1,
        totalValue: { $round: ['$totalValue', 2] },
        _id: 0
      }
    },
    { $sort: { count: -1 } }
  ]);

  // Average payment time
  const paymentTimeData = await Payment.aggregate([
    {
      $match: {
        clientId: id,
        status: 'COMPLETED',
        isDeleted: false
      }
    },
    {
      $lookup: {
        from: 'invoices',
        localField: 'invoiceId',
        foreignField: '_id',
        as: 'invoice'
      }
    },
    {
      $unwind: '$invoice'
    },
    {
      $project: {
        paymentDate: 1,
        issueDate: '$invoice.issueDate',
        dueDate: '$invoice.dueDate',
        daysFromIssue: {
          $divide: [
            { $subtract: ['$paymentDate', '$invoice.issueDate'] },
            1000 * 60 * 60 * 24
          ]
        },
        daysFromDue: {
          $divide: [
            { $subtract: ['$paymentDate', '$invoice.dueDate'] },
            1000 * 60 * 60 * 24
          ]
        }
      }
    },
    {
      $group: {
        _id: null,
        avgDaysFromIssue: { $avg: '$daysFromIssue' },
        avgDaysFromDue: { $avg: '$daysFromDue' },
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        avgDaysFromIssue: { $round: ['$avgDaysFromIssue', 1] },
        avgDaysFromDue: { $round: ['$avgDaysFromDue', 1] },
        count: 1
      }
    }
  ]);

  res.json({
    success: true,
    data: {
      client: {
        id: client._id,
        name: `${client.firstName} ${client.lastName}`,
        email: client.email,
        companyName: client.companyName
      },
      metrics: {
        totalInvoices,
        totalRevenue: revenueData[0]?.totalRevenue || 0,
        averageInvoiceValue: invoiceStats[0]?.averageValue || 0,
        outstandingBalance: outstandingInvoices[0]?.outstandingBalance || 0,
        averagePaymentTime: paymentTimeData[0]?.avgDaysFromDue || 0
      },
      paymentHistory: paymentHistory.reverse(),
      invoiceStatus,
      dateRange: {
        startDate: startDate || null,
        endDate: endDate || null
      }
    }
  });
});

// GET /invoices/analytics
const getInvoiceAnalytics = asyncHandler(async (req, res) => {
  const { startDate, endDate, status, month, year } = req.query;

  // Build base filter
  let matchFilter = { isDeleted: false };

  if (startDate && endDate) {
    matchFilter.issueDate = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  if (status) {
    matchFilter.status = status;
  }

  if (month && year) {
    matchFilter.issueDate = {
      $gte: new Date(year, month - 1, 1),
      $lt: new Date(year, month, 1)
    };
  }

  // Total invoices created
  const totalInvoices = await Invoice.countDocuments(matchFilter);

  // Invoice status breakdown
  const statusBreakdown = await Invoice.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalValue: { $sum: '$total' },
        averageValue: { $avg: '$total' }
      }
    },
    {
      $project: {
        status: '$_id',
        count: 1,
        totalValue: { $round: ['$totalValue', 2] },
        averageValue: { $round: ['$averageValue', 2] },
        _id: 0
      }
    },
    { $sort: { count: -1 } }
  ]);

  // Monthly invoice trends
  const monthlyTrends = await Invoice.aggregate([
    { 
      $match: {
        ...matchFilter,
        issueDate: {
          $gte: new Date(new Date().getFullYear() - 1, 0, 1),
          $lte: new Date()
        }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$issueDate' },
          month: { $month: '$issueDate' }
        },
        count: { $sum: 1 },
        totalValue: { $sum: '$total' },
        averageValue: { $avg: '$total' }
      }
    },
    {
      $project: {
        period: { $concat: [{ $toString: '$_id.year' }, '-', { $toString: '$_id.month' }] },
        count: 1,
        totalValue: { $round: ['$totalValue', 2] },
        averageValue: { $round: ['$averageValue', 2] },
        _id: 0
      }
    },
    { $sort: { period: 1 } }
  ]);

  // Invoice value trends
  const valueRanges = await Invoice.aggregate([
    { $match: matchFilter },
    {
      $bucket: {
        groupBy: '$total',
        boundaries: [0, 100, 500, 1000, 5000, 10000, 50000, Infinity],
        default: 'Other',
        output: {
          count: { $sum: 1 },
          totalValue: { $sum: '$total' }
        }
      }
    },
    {
      $project: {
        range: {
          $switch: {
            branches: [
              { case: { $eq: ['$ _id', 0] }, then: '$0 - $100' },
              { case: { $eq: ['$ _id', 100] }, then: '$100 - $500' },
              { case: { $eq: ['$ _id', 500] }, then: '$500 - $1,000' },
              { case: { $eq: ['$ _id', 1000] }, then: '$1,000 - $5,000' },
              { case: { $eq: ['$ _id', 5000] }, then: '$5,000 - $10,000' },
              { case: { $eq: ['$ _id', 10000] }, then: '$10,000 - $50,000' }
            ],
            default: '$50,000+'
          }
        },
        count: 1,
        totalValue: { $round: ['$totalValue', 2] },
        _id: 0
      }
    },
    { $sort: { count: -1 } }
  ]);

  // Average payment time analysis
  const paymentTimeAnalysis = await Invoice.aggregate([
    {
      $match: {
        ...matchFilter,
        status: 'PAID'
      }
    },
    {
      $project: {
        daysToPay: {
          $divide: [
            { $subtract: ['$paidDate', '$issueDate'] },
            1000 * 60 * 60 * 24
          ]
        },
        isOverdue: {
          $cond: {
            if: { $gt: ['$paidDate', '$dueDate'] },
            then: true,
            else: false
          }
        },
        overdueDays: {
          $cond: {
            if: { $gt: ['$paidDate', '$dueDate'] },
            then: {
              $divide: [
                { $subtract: ['$paidDate', '$dueDate'] },
                1000 * 60 * 60 * 24
              ]
            },
            else: 0
          }
        }
      }
    },
    {
      $group: {
        _id: null,
        averagePaymentDays: { $avg: '$daysToPay' },
        overduePaymentRate: {
          $avg: { $cond: ['$isOverdue', 1, 0] }
        },
        averageOverdueDays: {
          $avg: {
            $cond: [
              { $gt: ['$overdueDays', 0] },
              '$overdueDays',
              null
            ]
          }
        },
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        averagePaymentDays: { $round: ['$averagePaymentDays', 1] },
        overduePaymentRate: { $multiply: [{ $round: ['$overduePaymentRate', 3] }, 100] },
        averageOverdueDays: { $round: ['$averageOverdueDays', 1] },
        count: 1
      }
    }
  ]);

  res.json({
    success: true,
    data: {
      totalInvoices,
      statusBreakdown,
      monthlyTrends,
      valueRanges,
      paymentTimeAnalysis: paymentTimeAnalysis[0] || {
        averagePaymentDays: 0,
        overduePaymentRate: 0,
        averageOverdueDays: 0,
        count: 0
      },
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        status: status || null,
        month: month || null,
        year: year || null
      }
    }
  });
});

// GET /payments/analytics
const getPaymentAnalytics = asyncHandler(async (req, res) => {
  const { startDate, endDate, paymentMethod } = req.query;

  // Build base filter
  let matchFilter = { isDeleted: false };

  if (startDate && endDate) {
    matchFilter.paymentDate = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  if (paymentMethod) {
    matchFilter.paymentMethod = paymentMethod;
  }

  // Total payments received
  const totalPayments = await Payment.countDocuments(matchFilter);

  // Payment method breakdown
  const methodBreakdown = await Payment.aggregate([
    { $match: { ...matchFilter, status: 'COMPLETED' } },
    {
      $group: {
        _id: '$paymentMethod',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        totalFees: { $sum: '$fees' },
        netAmount: { $sum: '$netAmount' }
      }
    },
    {
      $project: {
        method: '$_id',
        count: 1,
        totalAmount: { $round: ['$totalAmount', 2] },
        totalFees: { $round: ['$totalFees', 2] },
        netAmount: { $round: ['$netAmount', 2] },
        percentage: {
          $round: [
            { $multiply: [{ $divide: ['$count', { $literal: totalPayments }] }, 100] },
            2
          ]
        },
        _id: 0
      }
    },
    { $sort: { totalAmount: -1 } }
  ]);

  // Payment success rate
  const paymentStatus = await Payment.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        status: '$_id',
        count: 1,
        percentage: {
          $round: [
            { $multiply: [{ $divide: ['$count', { $literal: totalPayments }] }, 100] },
            2
          ]
        },
        _id: 0
      }
    }
  ]);

  // Payment processing time analysis
  const processingTimeAnalysis = await Payment.aggregate([
    {
      $match: {
        ...matchFilter,
        status: 'COMPLETED',
        processedDate: { $exists: true }
      }
    },
    {
      $project: {
        processingTime: {
          $divide: [
            { $subtract: ['$processedDate', '$paymentDate'] },
            1000 * 60 * 60 * 24
          ]
        },
        paymentMethod: 1
      }
    },
    {
      $group: {
        _id: null,
        averageProcessingTime: { $avg: '$processingTime' },
        minProcessingTime: { $min: '$processingTime' },
        maxProcessingTime: { $max: '$processingTime' },
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        averageProcessingTime: { $round: ['$averageProcessingTime', 2] },
        minProcessingTime: 1,
        maxProcessingTime: 1,
        count: 1
      }
    }
  ]);

  // Monthly payment trends
  const monthlyTrends = await Payment.aggregate([
    {
      $match: {
        ...matchFilter,
        status: 'COMPLETED',
        paymentDate: {
          $gte: new Date(new Date().getFullYear() - 1, 0, 1),
          $lte: new Date()
        }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$paymentDate' },
          month: { $month: '$paymentDate' }
        },
        totalAmount: { $sum: '$netAmount' },
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        period: { $concat: [{ $toString: '$_id.year' }, '-', { $toString: '$_id.month' }] },
        totalAmount: { $round: ['$totalAmount', 2] },
        count: 1,
        _id: 0
      }
    },
    { $sort: { period: 1 } }
  ]);

  res.json({
    success: true,
    data: {
      totalPayments,
      methodBreakdown,
      paymentStatus,
      processingTimeAnalysis: processingTimeAnalysis[0] || {
        averageProcessingTime: 0,
        minProcessingTime: 0,
        maxProcessingTime: 0,
        count: 0
      },
      monthlyTrends,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        paymentMethod: paymentMethod || null
      }
    }
  });
});

module.exports = {
  getClientAnalytics,
  getInvoiceAnalytics,
  getPaymentAnalytics
};