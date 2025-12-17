const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const { generateAccessToken, generateRefreshToken } = require('../utils/jwt');
const {
  validateCreateUser,
  validateUpdateUser,
  validateChangeRole,
  validateToggleStatus,
  validateUpdateProfile
} = require('../middleware/userValidation');

// Get all users with pagination
const getUsers = asyncHandler(async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const role = req.query.role || '';

    // Build query
    let query = {};
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { companyName: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (role && ['ADMIN', 'ACCOUNTANT', 'CLIENT'].includes(role)) {
      query.role = role;
    }

    const totalUsers = await User.countDocuments(query);
    const totalPages = Math.ceil(totalUsers / limit);
    const skip = (page - 1) * limit;

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-password -refreshToken -passwordResetToken -passwordResetExpires');

    res.json({
      success: true,
      message: 'Users retrieved successfully',
      data: {
        users,
        pagination: {
          currentPage: page,
          totalPages,
          totalUsers,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
          limit
        }
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve users'
    });
  }
});

// Get user by ID
const getUserById = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -refreshToken -passwordResetToken -passwordResetExpires');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user can access this resource
    if (req.user.role !== 'ADMIN' && req.user._id.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only access your own profile'
      });
    }

    res.json({
      success: true,
      message: 'User retrieved successfully',
      data: { user }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user'
    });
  }
});

// Create new user (Admin only)
const createUser = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { email, password, firstName, lastName, role, companyName, phone, address, isActive } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: 'User with this email already exists'
    });
  }

  // Create user
  const user = await User.create({
    email: email.toLowerCase(),
    password,
    firstName,
    lastName,
    role: role || 'CLIENT',
    companyName,
    phone,
    address,
    isActive: isActive !== undefined ? isActive : true
  });

  res.status(201).json({
    success: true,
    message: 'User created successfully',
    data: { user }
  });
});

// Update user profile
const updateUser = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { firstName, lastName, companyName, phone, address } = req.body;
  const userId = req.params.id;

  // Check if user exists
  let user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // Check if user can update this profile
  if (req.user.role !== 'ADMIN' && req.user._id.toString() !== userId) {
    return res.status(403).json({
      success: false,
      message: 'You can only update your own profile'
    });
  }

  // Prevent non-admin users from updating sensitive fields
  if (req.user.role !== 'ADMIN') {
    const { role, isActive, ...allowedUpdates } = req.body;
    req.body = { ...allowedUpdates };
  }

  // Update user
  user = await User.findByIdAndUpdate(
    userId,
    { $set: req.body },
    { new: true, runValidators: true }
  ).select('-password -refreshToken -passwordResetToken -passwordResetExpires');

  res.json({
    success: true,
    message: 'User updated successfully',
    data: { user }
  });
});

// Delete user (Admin only)
const deleteUser = asyncHandler(async (req, res) => {
  const userId = req.params.id;

  // Check if user exists
  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // Prevent admin from deleting themselves
  if (user._id.toString() === req.user._id.toString()) {
    return res.status(400).json({
      success: false,
      message: 'You cannot delete your own account'
    });
  }

  await User.findByIdAndDelete(userId);

  res.json({
    success: true,
    message: 'User deleted successfully'
  });
});

// Change user role (Admin only)
const changeUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  const userId = req.params.id;

  if (!['ADMIN', 'ACCOUNTANT', 'CLIENT'].includes(role)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid role. Must be ADMIN, ACCOUNTANT, or CLIENT'
    });
  }

  // Check if user exists
  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // Update role
  user.role = role;
  await user.save();

  res.json({
    success: true,
    message: 'User role updated successfully',
    data: { user: user.toJSON() }
  });
});

// Toggle user active status (Admin only)
const toggleUserStatus = asyncHandler(async (req, res) => {
  const userId = req.params.id;

  // Check if user exists
  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // Prevent admin from deactivating themselves
  if (user._id.toString() === req.user._id.toString() && req.body.isActive === false) {
    return res.status(400).json({
      success: false,
      message: 'You cannot deactivate your own account'
    });
  }

  // Update active status
  user.isActive = req.body.isActive;
  await user.save();

  res.json({
    success: true,
    message: `User ${req.body.isActive ? 'activated' : 'deactivated'} successfully`,
    data: { user: user.toJSON() }
  });
});

// Get user profile (self)
const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .select('-password -refreshToken -passwordResetToken -passwordResetExpires');

  res.json({
    success: true,
    message: 'Profile retrieved successfully',
    data: { user }
  });
});

// Update user profile (self)
const updateProfile = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { firstName, lastName, companyName, phone, address } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { firstName, lastName, companyName, phone, address } },
    { new: true, runValidators: true }
  ).select('-password -refreshToken -passwordResetToken -passwordResetExpires');

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: { user }
  });
});

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  changeUserRole,
  toggleUserStatus,
  getProfile,
  updateProfile
};