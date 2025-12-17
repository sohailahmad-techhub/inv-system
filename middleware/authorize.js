// Role-based authorization middleware
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // Check if user's role is in the allowed roles
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to access this resource'
        });
      }

      next();
    } catch (error) {
      console.error('Authorization error:', error);
      return res.status(500).json({
        success: false,
        message: 'Authorization failed'
      });
    }
  };
};

// Admin only middleware
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

// Accountant or Admin only middleware
const requireAccountantOrAdmin = (req, res, next) => {
  if (!req.user || !['ADMIN', 'ACCOUNTANT'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Accountant or Admin access required'
    });
  }
  next();
};

module.exports = {
  authorize,
  requireAdmin,
  requireAccountantOrAdmin
};