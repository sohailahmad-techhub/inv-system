const express = require('express');
const router = express.Router();
const {
  getExpenses,
  getExpense,
  createExpense,
  updateExpense,
  deleteExpense,
  approveExpense,
  getExpenseAnalytics,
  exportExpenses,
  getExpenseCategories
} = require('../controllers/expenseController');
const { auth } = require('../middleware/auth');

// All routes require authentication
router.use(auth);

// Expense CRUD operations
router.route('/')
  .get(getExpenses)
  .post(createExpense);

router.route('/:id')
  .get(getExpense)
  .put(updateExpense)
  .delete(deleteExpense);

// Expense actions
router.post('/:id/approve', approveExpense);

// Analytics and utilities
router.get('/analytics', getExpenseAnalytics);
router.get('/export', exportExpenses);
router.get('/categories', getExpenseCategories);

module.exports = router;