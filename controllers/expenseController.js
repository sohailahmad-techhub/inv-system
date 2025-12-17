const asyncHandler = require('express-async-handler');
const Expense = require('../models/Expense');
const User = require('../models/User');

// @desc    Get all expenses for a tenant
// @route   GET /api/expenses
// @access  Private
const getExpenses = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  
  const query = { tenantId };
  
  // Apply filters
  if (req.query.category) {
    query.category = req.query.category;
  }
  if (req.query.approvalStatus) {
    query.approvalStatus = req.query.approvalStatus;
  }
  if (req.query.amountMin || req.query.amountMax) {
    query.amount = {};
    if (req.query.amountMin) query.amount.$gte = parseFloat(req.query.amountMin);
    if (req.query.amountMax) query.amount.$lte = parseFloat(req.query.amountMax);
  }
  if (req.query.dateFrom || req.query.dateTo) {
    query.expenseDate = {};
    if (req.query.dateFrom) query.expenseDate.$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo) query.expenseDate.$lte = new Date(req.query.dateTo);
  }
  if (req.query.search) {
    query.$or = [
      { title: { $regex: req.query.search, $options: 'i' } },
      { description: { $regex: req.query.search, $options: 'i' } },
      { 'vendor.name': { $regex: req.query.search, $options: 'i' } }
    ];
  }
  
  const expenses = await Expense.find(query)
    .populate('createdBy', 'firstName lastName email')
    .populate('approvedBy', 'firstName lastName email')
    .sort({ expenseDate: -1 })
    .skip(skip)
    .limit(limit);
  
  const total = await Expense.countDocuments(query);
  
  res.json({
    success: true,
    data: expenses,
    pagination: {
      current: page,
      pages: Math.ceil(total / limit),
      total
    }
  });
});

// @desc    Get single expense
// @route   GET /api/expenses/:id
// @access  Private
const getExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id)
    .populate('createdBy', 'firstName lastName email')
    .populate('approvedBy', 'firstName lastName email');
  
  if (!expense) {
    res.status(404);
    throw new Error('Expense not found');
  }
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (expense.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  res.json({
    success: true,
    data: expense
  });
});

// @desc    Create new expense
// @route   POST /api/expenses
// @access  Private
const createExpense = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    amount,
    currency,
    category,
    subcategory,
    vendor,
    expenseDate,
    paymentMethod,
    receipt,
    taxInfo,
    tags,
    project,
    isRecurring,
    recurringPattern
  } = req.body;
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  
  const expense = await Expense.create({
    title,
    description,
    amount,
    currency: currency || 'USD',
    category,
    subcategory,
    vendor,
    expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
    paymentMethod,
    receipt,
    taxInfo,
    tags,
    project,
    isRecurring: isRecurring || false,
    recurringPattern,
    createdBy: req.user._id,
    tenantId
  });
  
  // Check if approval is required
  if (expense.needsApproval()) {
    expense.approvalStatus = 'pending';
    // Send notification to admin/accountant
  } else {
    expense.approvalStatus = 'not_required';
  }
  
  await expense.save();
  
  const populatedExpense = await Expense.findById(expense._id)
    .populate('createdBy', 'firstName lastName email');
  
  // Trigger webhook
  await triggerWebhook('expense.created', populatedExpense);
  
  res.status(201).json({
    success: true,
    data: populatedExpense
  });
});

// @desc    Update expense
// @route   PUT /api/expenses/:id
// @access  Private
const updateExpense = asyncHandler(async (req, res) => {
  let expense = await Expense.findById(req.params.id);
  
  if (!expense) {
    res.status(404);
    throw new Error('Expense not found');
  }
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (expense.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  // Check permissions - only creator or admin can edit
  if (expense.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN') {
    res.status(403);
    throw new Error('Not authorized to edit this expense');
  }
  
  // Check if already approved
  if (expense.approvalStatus === 'approved') {
    res.status(400);
    throw new Error('Cannot edit approved expense');
  }
  
  const {
    title,
    description,
    amount,
    currency,
    category,
    subcategory,
    vendor,
    expenseDate,
    paymentMethod,
    receipt,
    taxInfo,
    tags,
    project,
    isRecurring,
    recurringPattern
  } = req.body;
  
  if (title !== undefined) expense.title = title;
  if (description !== undefined) expense.description = description;
  if (amount !== undefined) expense.amount = amount;
  if (currency !== undefined) expense.currency = currency;
  if (category !== undefined) expense.category = category;
  if (subcategory !== undefined) expense.subcategory = subcategory;
  if (vendor !== undefined) expense.vendor = vendor;
  if (expenseDate !== undefined) expense.expenseDate = new Date(expenseDate);
  if (paymentMethod !== undefined) expense.paymentMethod = paymentMethod;
  if (receipt !== undefined) expense.receipt = receipt;
  if (taxInfo !== undefined) expense.taxInfo = taxInfo;
  if (tags !== undefined) expense.tags = tags;
  if (project !== undefined) expense.project = project;
  if (isRecurring !== undefined) expense.isRecurring = isRecurring;
  if (recurringPattern !== undefined) expense.recurringPattern = recurringPattern;
  
  expense.lastModifiedBy = req.user._id;
  
  // Re-evaluate approval requirement if amount changed
  if (amount && expense.needsApproval() && expense.approvalStatus === 'not_required') {
    expense.approvalStatus = 'pending';
  }
  
  await expense.save();
  
  const updatedExpense = await Expense.findById(expense._id)
    .populate('createdBy', 'firstName lastName email')
    .populate('approvedBy', 'firstName lastName email');
  
  res.json({
    success: true,
    data: updatedExpense
  });
});

// @desc    Delete expense
// @route   DELETE /api/expenses/:id
// @access  Private
const deleteExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  
  if (!expense) {
    res.status(404);
    throw new Error('Expense not found');
  }
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (expense.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  // Check permissions - only creator or admin can delete
  if (expense.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN') {
    res.status(403);
    throw new Error('Not authorized to delete this expense');
  }
  
  // Check if approved
  if (expense.approvalStatus === 'approved') {
    res.status(400);
    throw new Error('Cannot delete approved expense');
  }
  
  await Expense.findByIdAndDelete(req.params.id);
  
  res.json({
    success: true,
    message: 'Expense deleted'
  });
});

// @desc    Approve/Reject expense
// @route   POST /api/expenses/:id/approve
// @access  Private (Admin/Accountant only)
const approveExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  
  if (!expense) {
    res.status(404);
    throw new Error('Expense not found');
  }
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  if (expense.tenantId !== tenantId) {
    res.status(403);
    throw new Error('Access denied');
  }
  
  // Check permissions
  if (!['ADMIN', 'ACCOUNTANT'].includes(req.user.role)) {
    res.status(403);
    throw new Error('Not authorized to approve expenses');
  }
  
  const { approved, reason } = req.body;
  
  expense.approvalStatus = approved ? 'approved' : 'rejected';
  expense.approvedBy = req.user._id;
  expense.approvedAt = new Date();
  
  if (!approved && reason) {
    expense.rejectionReason = reason;
  }
  
  await expense.save();
  
  res.json({
    success: true,
    message: `Expense ${approved ? 'approved' : 'rejected'}`,
    data: expense
  });
});

// @desc    Get expense analytics
// @route   GET /api/expenses/analytics
// @access  Private
const getExpenseAnalytics = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  const { period = '30d' } = req.query;
  
  let dateFilter = {};
  const now = new Date();
  
  switch (period) {
    case '7d':
      dateFilter = { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
      break;
    case '30d':
      dateFilter = { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
      break;
    case '90d':
      dateFilter = { $gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) };
      break;
    case '1y':
      dateFilter = { $gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) };
      break;
  }
  
  const analytics = await Expense.aggregate([
    { $match: { tenantId: tenantId, expenseDate: dateFilter } },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        totalExpenses: { $sum: 1 },
        avgExpenseAmount: { $avg: '$amount' },
        deductibleAmount: { $sum: { $cond: ['$taxInfo.isDeductible', '$amount', 0] } }
      }
    }
  ]);
  
  const categoryBreakdown = await Expense.aggregate([
    { $match: { tenantId: tenantId, expenseDate: dateFilter } },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        total: { $sum: '$amount' },
        deductible: { $sum: { $cond: ['$taxInfo.isDeductible', '$amount', 0] } }
      }
    },
    { $sort: { total: -1 } }
  ]);
  
  const monthlyExpenses = await Expense.aggregate([
    { $match: { tenantId: tenantId, expenseDate: dateFilter } },
    {
      $group: {
        _id: {
          year: { $year: '$expenseDate' },
          month: { $month: '$expenseDate' }
        },
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);
  
  const topVendors = await Expense.aggregate([
    { $match: { tenantId: tenantId, expenseDate: dateFilter } },
    {
      $group: {
        _id: '$vendor.name',
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { total: -1 } },
    { $limit: 10 }
  ]);
  
  res.json({
    success: true,
    data: {
      summary: analytics[0] || {
        totalAmount: 0,
        totalExpenses: 0,
        avgExpenseAmount: 0,
        deductibleAmount: 0
      },
      categoryBreakdown,
      monthlyExpenses,
      topVendors
    }
  });
});

// @desc    Export expenses to CSV
// @route   GET /api/expenses/export
// @access  Private
const exportExpenses = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  const { category, dateFrom, dateTo } = req.query;
  
  const query = { tenantId };
  
  if (category) query.category = category;
  if (dateFrom || dateTo) {
    query.expenseDate = {};
    if (dateFrom) query.expenseDate.$gte = new Date(dateFrom);
    if (dateTo) query.expenseDate.$lte = new Date(dateTo);
  }
  
  const expenses = await Expense.find(query)
    .populate('createdBy', 'firstName lastName')
    .sort({ expenseDate: -1 });
  
  // Generate CSV content
  const csvHeaders = 'Expense ID,Title,Description,Amount,Currency,Category,Vendor,Expense Date,Payment Method,Tax Deductible,Created By\n';
  const csvRows = expenses.map(expense => {
    return [
      expense.expenseId,
      `"${expense.title}"`,
      `"${expense.description || ''}"`,
      expense.amount,
      expense.currency,
      expense.category,
      `"${expense.vendor?.name || ''}"`,
      expense.expenseDate.toISOString().split('T')[0],
      expense.paymentMethod,
      expense.taxInfo?.isDeductible ? 'Yes' : 'No',
      `${expense.createdBy.firstName} ${expense.createdBy.lastName}`
    ].join(',');
  });
  
  const csvContent = csvHeaders + csvRows.join('\n');
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=expenses-${Date.now()}.csv`);
  res.send(csvContent);
});

// @desc    Get expense categories
// @route   GET /api/expenses/categories
// @access  Private
const getExpenseCategories = asyncHandler(async (req, res) => {
  const categories = [
    { value: 'office_supplies', label: 'Office Supplies' },
    { value: 'software_tools', label: 'Software & Tools' },
    { value: 'marketing_advertising', label: 'Marketing & Advertising' },
    { value: 'travel_expenses', label: 'Travel Expenses' },
    { value: 'professional_services', label: 'Professional Services' },
    { value: 'equipment', label: 'Equipment' },
    { value: 'utilities', label: 'Utilities' },
    { value: 'rent_lease', label: 'Rent & Lease' },
    { value: 'insurance', label: 'Insurance' },
    { value: 'training_education', label: 'Training & Education' },
    { value: 'meals_entertainment', label: 'Meals & Entertainment' },
    { value: 'vehicle_fuel', label: 'Vehicle & Fuel' },
    { value: 'telecommunications', label: 'Telecommunications' },
    { value: 'bank_fees', label: 'Bank Fees' },
    { value: 'legal_professional', label: 'Legal & Professional' },
    { value: 'accounting_tax', label: 'Accounting & Tax' },
    { value: 'other', label: 'Other' }
  ];
  
  res.json({
    success: true,
    data: categories
  });
});

// Helper function to trigger webhooks
async function triggerWebhook(event, data) {
  console.log(`Triggering webhook for event: ${event}`);
  // Implementation would go here
}

module.exports = {
  getExpenses,
  getExpense,
  createExpense,
  updateExpense,
  deleteExpense,
  approveExpense,
  getExpenseAnalytics,
  exportExpenses,
  getExpenseCategories
};