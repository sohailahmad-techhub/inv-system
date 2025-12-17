const asyncHandler = require('express-async-handler');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const User = require('../models/User');

const getDateRanges = (year = new Date().getFullYear()) => {
  const startOfYear = new Date(year, 0, 1);
  const endOfYear = new Date(year + 1, 0, 1);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return {
    year: { $gte: startOfYear, $lt: endOfYear },
    month: { $gte: startOfMonth, $lt: endOfMonth }
  };
};

const getDashboardSummary = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || 'default';
  const today = new Date();
  const ranges = getDateRanges();

  const [revenueThisMonth, revenueThisYear, revenueAllTime] = await Promise.all([
    Payment.aggregate([
      {
        $match: {
          tenantId,
          isDeleted: false,
          status: 'Completed',
          paymentDate: ranges.month
        }
      },
      { $group: { _id: null, total: { $sum: '$netAmount' } } }
    ]),
    Payment.aggregate([
      {
        $match: {
          tenantId,
          isDeleted: false,
          status: 'Completed',
          paymentDate: ranges.year
        }
      },
      { $group: { _id: null, total: { $sum: '$netAmount' } } }
    ]),
    Payment.aggregate([
      {
        $match: {
          tenantId,
          isDeleted: false,
          status: 'Completed'
        }
      },
      { $group: { _id: null, total: { $sum: '$netAmount' } } }
    ])
  ]);

  const pendingInvoices = await Invoice.aggregate([
    {
      $match: {
        tenantId,
        isDeleted: false,
        paymentStatus: { $in: ['Unpaid', 'Partially Paid'] },
        dueDate: { $gte: today }
      }
    },
    {
      $project: {
        outstanding: { $subtract: ['$totalAmount', '$paidAmount'] }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$outstanding' },
        count: { $sum: 1 }
      }
    }
  ]);

  const overdueInvoices = await Invoice.aggregate([
    {
      $match: {
        tenantId,
        isDeleted: false,
        paymentStatus: { $ne: 'Paid' },
        dueDate: { $lt: today }
      }
    },
    {
      $project: {
        outstanding: { $subtract: ['$totalAmount', '$paidAmount'] }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$outstanding' },
        count: { $sum: 1 }
      }
    }
  ]);

  const totalClients = await User.countDocuments({
    tenantId,
    role: 'CLIENT',
    isActive: true
  });

  const averageInvoiceValue = await Invoice.aggregate([
    {
      $match: {
        tenantId,
        isDeleted: false
      }
    },
    {
      $group: {
        _id: null,
        average: { $avg: '$totalAmount' }
      }
    }
  ]);

  res.json({
    success: true,
    data: {
      revenue: {
        thisMonth: Number((revenueThisMonth[0]?.total || 0).toFixed(2)),
        thisYear: Number((revenueThisYear[0]?.total || 0).toFixed(2)),
        allTime: Number((revenueAllTime[0]?.total || 0).toFixed(2))
      },
      pendingPayments: {
        amount: Number((pendingInvoices[0]?.total || 0).toFixed(2)),
        count: pendingInvoices[0]?.count || 0
      },
      overdueInvoices: {
        count: overdueInvoices[0]?.count || 0,
        amount: Number((overdueInvoices[0]?.total || 0).toFixed(2))
      },
      totalClients,
      averageInvoiceValue: Number((averageInvoiceValue[0]?.average || 0).toFixed(2))
    }
  });
});

const getRevenueChart = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || 'default';
  const { period = 'monthly', year = new Date().getFullYear() } = req.query;

  const yearNum = parseInt(year, 10);
  const ranges = getDateRanges(yearNum);

  const group =
    period === 'yearly'
      ? { year: { $year: '$paymentDate' } }
      : { year: { $year: '$paymentDate' }, month: { $month: '$paymentDate' } };

  const revenueData = await Payment.aggregate([
    {
      $match: {
        tenantId,
        isDeleted: false,
        status: 'Completed',
        paymentDate: ranges.year
      }
    },
    {
      $group: {
        _id: group,
        revenue: { $sum: '$netAmount' },
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        period:
          period === 'yearly'
            ? { $toString: '$_id.year' }
            : {
                $concat: [
                  { $toString: '$_id.year' },
                  '-',
                  {
                    $cond: [
                      { $lt: ['$_id.month', 10] },
                      { $concat: ['0', { $toString: '$_id.month' }] },
                      { $toString: '$_id.month' }
                    ]
                  }
                ]
              },
        revenue: { $round: ['$revenue', 2] },
        count: 1
      }
    },
    { $sort: { period: 1 } }
  ]);

  res.json({
    success: true,
    data: {
      period,
      year: yearNum,
      revenueData
    }
  });
});

const getPendingInvoices = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || 'default';
  const { page = 1, limit = 10 } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;
  const today = new Date();

  const query = {
    tenantId,
    isDeleted: false,
    paymentStatus: { $in: ['Unpaid', 'Partially Paid'] },
    dueDate: { $gte: today }
  };

  const [invoices, total] = await Promise.all([
    Invoice.find(query)
      .populate('clientId', 'firstName lastName email companyName')
      .sort({ dueDate: 1 })
      .skip(skip)
      .limit(limitNum),
    Invoice.countDocuments(query)
  ]);

  res.json({
    success: true,
    data: {
      invoices,
      pagination: {
        current: pageNum,
        pages: Math.ceil(total / limitNum),
        total,
        limit: limitNum
      }
    }
  });
});

const getOverdueInvoices = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || 'default';
  const { page = 1, limit = 10 } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;
  const today = new Date();

  const query = {
    tenantId,
    isDeleted: false,
    paymentStatus: { $ne: 'Paid' },
    dueDate: { $lt: today }
  };

  const [invoices, total] = await Promise.all([
    Invoice.find(query)
      .populate('clientId', 'firstName lastName email companyName')
      .sort({ dueDate: 1 })
      .skip(skip)
      .limit(limitNum),
    Invoice.countDocuments(query)
  ]);

  res.json({
    success: true,
    data: {
      invoices,
      pagination: {
        current: pageNum,
        pages: Math.ceil(total / limitNum),
        total,
        limit: limitNum
      }
    }
  });
});

const getRecentInvoices = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || 'default';
  const { limit = 10 } = req.query;

  const recentInvoices = await Invoice.find({ tenantId, isDeleted: false })
    .populate('clientId', 'firstName lastName email companyName')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit, 10));

  res.json({
    success: true,
    data: {
      invoices: recentInvoices
    }
  });
});

const getTopClients = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || 'default';
  const { period = 'all', limit = 10 } = req.query;
  const now = new Date();

  const match = {
    tenantId,
    isDeleted: false,
    status: 'Completed'
  };

  if (period === 'month') {
    match.paymentDate = { $gte: new Date(now.getFullYear(), now.getMonth(), 1), $lte: now };
  } else if (period === 'year') {
    match.paymentDate = { $gte: new Date(now.getFullYear(), 0, 1), $lte: now };
  }

  const topClients = await Payment.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$clientId',
        totalRevenue: { $sum: '$netAmount' },
        paymentCount: { $sum: 1 }
      }
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: parseInt(limit, 10) },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'client'
      }
    },
    { $unwind: { path: '$client', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        clientId: '$_id',
        clientName: {
          $cond: [
            { $ifNull: ['$client', false] },
            { $concat: ['$client.firstName', ' ', '$client.lastName'] },
            'Unknown'
          ]
        },
        companyName: '$client.companyName',
        email: '$client.email',
        totalRevenue: { $round: ['$totalRevenue', 2] },
        paymentCount: 1
      }
    }
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
