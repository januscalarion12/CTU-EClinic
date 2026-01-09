require('dotenv').config();

const express = require('express');
const session = require('express-session');
const MSSQLStore = require('connect-mssql-v2');
const cors = require('cors');
const path = require('path');
const db = require('./Server/db');
const authRoutes = require('./Server/routes/auth');
const adminRoutes = require('./Server/routes/admin');
const nurseRoutes = require('./Server/routes/nurse');
const studentRoutes = require('./Server/routes/student');
const medicalRecordsRoutes = require('./Server/routes/medical-records');
const reportsRoutes = require('./Server/routes/reports');
const { runScheduledTasks } = require('./Server/utils/scheduler');
const { authenticateToken } = require('./Server/middleware/auth');

const app = express();

// Session configuration
const sessionConfig = {
  store: new MSSQLStore({
    server: process.env.DB_HOST || 'LAPTOP-CO8MFUK2\SQLEXPRESS',
    port: parseInt(process.env.DB_PORT) || 1433,
    user: process.env.DB_USER || 'clinic_app',
    password: process.env.DB_PASSWORD || 'Clinic@2026!',
    database: process.env.DB_NAME || 'CTU',
    options: {
      encrypt: true,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    table: 'sessions',
    ttl: 86400000, // 24 hours
    autoRemove: 'interval',
    autoRemoveInterval: 3600000, // 1 hour
    createDatabaseTable: false // Disable automatic table creation
  }),
  secret: process.env.SESSION_SECRET || 'your-session-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
};

app.use(session(sessionConfig));

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use((req, res, next) => {
  if (req.path === '/favicon.ico') {
    console.log('Favicon.ico requested at:', new Date().toISOString());
  }
  next();
});
app.use(express.static(path.join(__dirname, 'Public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', authenticateToken, adminRoutes);
app.use('/api/nurse', authenticateToken, nurseRoutes);
app.use('/api/student', authenticateToken, studentRoutes);
app.use('/api/students', authenticateToken, studentRoutes);
app.use('/api/medical-records', authenticateToken, medicalRecordsRoutes);
app.use('/api/reports', authenticateToken, reportsRoutes);

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  console.log(`404 API Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: `API route not found: ${req.method} ${req.originalUrl}` });
});

// Serve static files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port at http://localhost:${PORT}`);

  // Run scheduled tasks every 5 minutes to handle auto-cancellation accurately
  setInterval(runScheduledTasks, 5 * 60 * 1000); // 5 minutes

  // Run initial scheduled tasks
  runScheduledTasks();
});

module.exports = app;
