const express = require('express');
const router = express.Router();
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  changeUserRole,
  toggleUserStatus,
  getProfile,
  updateProfile
} = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const {
  validateCreateUser,
  validateUpdateUser,
  validateChangeRole,
  validateToggleStatus,
  validateUpdateProfile
} = require('../middleware/userValidation');

// Protect all user routes
router.use(authenticate);

// User profile routes (available to all authenticated users)
router.get('/profile', getProfile);
router.put('/profile', validateUpdateProfile, updateProfile);

// Admin only routes
router.get('/', authorize('ADMIN'), getUsers);
router.post('/', authorize('ADMIN'), validateCreateUser, createUser);
router.put('/:id/role', authorize('ADMIN'), validateChangeRole, changeUserRole);
router.put('/:id/status', authorize('ADMIN'), validateToggleStatus, toggleUserStatus);
router.delete('/:id', authorize('ADMIN'), deleteUser);

// General routes (user can access own, admin can access all)
router.get('/:id', getUserById);
router.put('/:id', validateUpdateUser, updateUser);

module.exports = router;