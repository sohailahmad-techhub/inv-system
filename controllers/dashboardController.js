const asyncHandler = require('express-async-handler');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const User = require('../models/User');

// Helper function to get date ranges
const getDateRanges = () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
  
  return {
    currentMonth: { $gte: startOfMonth, $lte: now },
    currentYear: { $gte: startOfYear, $lte: now },
    last30Days: { $gte: thirtyDaysAgo, $lte: now },
    allTime: {}
  };
};

// GET /dashboard/summary
const getDashboardSummary = asyncHandler(async (req, res) => {
  const dateRanges = getDateRanges();
  const today = new Date();

  // Revenue calculations
  const revenueThisMonth = await Payment.aggregate([
    {
      $match: {
        status: 'COMPLETED',
        paymentDate: dateRanges.currentMonth,
        isDeleted: false
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$netAmount' }
      }
    },
    {
      $project: {
        _id: 0,
        total: { $round: ['$total', 2] }
      }
    }
  ]);

  const revenueThisYear = await Payment.aggregate([
    {
      $match: {
        status: 'COMPLETED',
        paymentDate: dateRanges.currentYear,
        isDeleted: false
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$netAmount' }
      }
    },
    {
      $project: {
        _id: 0,
        total: { $round: ['$total', 2] }
      }
    }
  ]);

  const revenueAllTime = await Payment.aggregate([
    {
      $match: {
        status: 'COMPLETED',
        isDeleted: false
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$netAmount' }
      }
    },
    {
      $project: {
        _id: 0,
        total: { $round: ['$total', 2] }
      }
    }
  ]);

  // Pending payments amount
  const pendingInvoices = await Invoice.aggregate([
    {
      $match: {
        status: { $in: ['SENT', 'DRAFT'] },
        isDeleted: false
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$total' },
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        total: { $round: ['$total', 2] },
        count: 1
      }
    }
  ]);

  // Overdue invoices
  const overdueInvoices = await Invoice.aggregate([
    {
      $match: {
        status: { $in: ['SENT', 'OVERDUE'] },
        dueDate: { $lt: today },
        isDeleted: false
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$total' },
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        total: { $round: ['$total', 2] },
        count: 1
      }
    }
  ]);

  // Total clients
  const totalClients = await User.countDocuments({
    role: 'CLIENT',
    isActive: true
  });

  // Average invoice value
  const averageInvoiceValue = await Invoice.aggregate([
    {
      $match: {
        isDeleted: false
      }
    },
    {
      $group: {
        _id: null,
        average: { $avg: '$total' }
      }
    },
    {
      $project: {
        _id: 0,
        average: { $round: ['$average', 2] }
      }
    }
  ]);

  res.json({
    success: true,
    data: {
      revenue: {
        thisMonth: revenueThisMonth[0]?.total || 0,
        thisYear: revenueThisYear[0]?.total || 0,
        allTime: revenueAllTime[0]?.total || 0
      },
      pendingPayments: {
        amount: pendingInvoices[0]?.total || 0,
        count: pendingInvoices[0]?.count || 0
      },
      overdueInvoices: {
        count: overdueInvoices[0]?.count || 0,
        amount: overdueInvoices[0]?.total || 0
      },
      totalClients: totalClients || 0,
      averageInvoiceValue: averageInvoiceValue[0]?.average || 0
    }
  });
});

// GET /dashboard/revenue-chart
const getRevenueChart = asyncHandler(async (req, res) => {
  const { period = 'monthly', year = new Date().getFullYear() } = req.query;
  const dateRanges = getDateRanges();

  let groupBy;
  let dateFormat;

  if (period === 'monthly') {
    groupBy = { month: { $month: '$paymentDate' }, year: { $year: '$paymentDate' } };
    dateFormat = '%Y-%m';
  } else {
    groupBy = { year: { $year: '$paymentDate' } };
    dateFormat = '%Y';
  }

  const pipeline = [
    {
      $match: {
        status: 'COMPLETED',
        isDeleted: false,
        paymentDate: dateRanges.currentYear
      }
    },
    {
      $group: {
        _id: groupBy,
        revenue: { $sum: '$netAmount' },
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        period: {
          $cond: {
            if: { $eq: [period, 'monthly'] },
            then: { $concat: [{ $toString: '$_id.year' }, '-', { $toString: '$_id.month' }] },
            else: { $toString: '$_id.year' }
          }
        },
        revenue: { $round: ['$revenue', 2] },
        count: 1,
        _id: 0
      }
    },
    { $sort: { period: 1 } }
  ];

  const revenueData = await Payment.aggregate(pipeline);

  res.json({
    success: true,
    data: {
      period,
      year: parseInt(year),
      revenueData
    }
  });
});

// GET /dashboard/pending-invoices
const getPendingInvoices = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  const pendingInvoices = await Invoice.find({
    status: { $in: ['SENT', 'DRAFT'] },
    isDeleted: false
  })
    .populate('clientId', 'firstName lastName email companyName')
    .populate('createdBy', 'firstName lastName')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Invoice.countDocuments({
    status: { $in: ['SENT', 'DRAFT'] },
    isDeleted: false
  });

  res.json({
    success: true,
    data: {
      invoices: pendingInvoices,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit)
      }
    }
  });
});

// GET /dashboard/overdue-invoices
const getOverdueInvoices = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;
  const today = new Date();

  const overdueInvoices = await Invoice.find({
    status: { $in: ['SENT', 'OVERDUE'] },
    dueDate: { $lt: today },
    isDeleted: false
  })
    .populate('clientId', 'firstName lastName email companyName')
    .populate('createdBy', 'firstName lastName')
    .sort({ dueDate: 1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Invoice.countDocuments({
    status: { $in: ['SENT', 'OVERDUE'] },
    dueDate: { $lt: today },
    isDeleted: false
  });

  res.json({
    success: true,
    data: {
      invoices: overdueInvoices,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit)
      }
    }
  });
});

// GET /dashboard/recent-invoices
const getRecentInvoices = asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;

  const recentInvoices = await Invoice.find({
    isDeleted: false
  })
    .populate('clientId', 'firstName lastName email companyName')
    .populate('createdBy', 'firstName lastName')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit));

  res.json({
    success: true,
    data: {
      invoices: recentInvoices
    }
  });
});

// GET /dashboard/top-clients
const getTopClients = asyncHandler(async (req, res) => {
  const { period = 'all', limit = 10 } = req.query;
  const dateRanges = getDateRanges();

  let dateFilter = {};
  if (period === 'month') {
    dateFilter = { paymentDate: dateRanges.currentMonth };
  } else if (period === 'year') {
    dateFilter = { paymentDate: dateRanges.currentYear };
  }

  const topClients = await Payment.aggregate([
    {
      $match: {
        status: 'COMPLETED',
        isDeleted: false,
        ...dateFilter
      }
    },
    {
      $group: {
        _id: '$clientId',
        totalRevenue: { $sum: '$netAmount' },
        paymentCount: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'client'
      }
    },
    {
      $unwind: '$client'
    },
    {
      $project: {
        clientId: '$_id',
        clientName: { $concat: ['$client.firstName', ' ', '$client.lastName'] },
        companyName: '$client.companyName',
        email: '$client.email',
        totalRevenue: { $round: ['$totalRevenue', 2] },
        paymentCount: 1,
        _id: 0
      }
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: parseInt(limit) }
  ]);

  res.json({
    success: true,
    data: {
      period,
      clients: topClients
    }
  });
});

module.exports = {
  getDashboardSummary,
  getRevenueChart,
  getPendingInvoices,
  getOverdueInvoices,
  getRecentInvoices,
  getTopClients
};