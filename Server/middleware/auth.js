const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  // Check for JWT token in Authorization header first (more specific)
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      req.user = decoded;
      console.log('Auth: JWT user found:', { id: req.user.id, role: req.user.role });
      return next();
    } catch (err) {
      console.error('JWT verification failed:', err.message);
      // Don't return here, try session next if JWT fails
    }
  }

  // Check for session-based authentication next
  if (req.session && req.session.user) {
    req.user = req.session.user;
    console.log('Auth: Session user found:', { id: req.user.id, role: req.user.role });
    return next();
  }

  // If no session and no valid token, return 401
  console.log('Auth: No authentication found');
  return res.status(401).json({ message: 'Session expired. Please login again.' });
};

const authorizeRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      console.log('Auth: No req.user in authorizeRole');
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    // Normalize role for comparison
    const userRole = (req.user.role || '').toLowerCase().trim();
    const allowedRoles = roles.map(r => r.toLowerCase().trim());
    
    console.log('Auth: Authorizing role:', { userRole, allowedRoles });
    
    if (!allowedRoles.includes(userRole)) {
      console.log('Auth: Permission denied for role:', userRole);
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };
};

module.exports = {
  authenticateToken,
  authorizeRole
};