const express = require('express');
const router = express.Router();
const {
  register,
  login,
  logout,
  refreshToken,
  verifyToken,
  forgotPassword,
  resetPassword
} = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const {
  validateRegister,
  validateLogin,
  validatePasswordReset,
  validateForgotPassword,
  validateRefreshToken
} = require('../middleware/validation');

// Auth routes
router.post('/register', validateRegister, register);
router.post('/login', validateLogin, login);
router.post('/logout', authenticate, logout);
router.post('/refresh', validateRefreshToken, refreshToken);
router.get('/verify', authenticate, verifyToken);
router.post('/forgot-password', validateForgotPassword, forgotPassword);
router.post('/reset-password', validatePasswordReset, resetPassword);

module.exports = router;