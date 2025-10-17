const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  // Check for session-based authentication first
  if (req.session && req.session.user) {
    req.user = req.session.user;
    return next();
  }

  // If no session, return 401
  return res.status(401).json({ message: 'Session expired. Please login again.' });
};

const authorizeRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };
};

module.exports = {
  authenticateToken,
  authorizeRole
};