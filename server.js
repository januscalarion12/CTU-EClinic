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
const { authenticateToken } = require('./Server/middleware/auth');

const app = express();

// Session configuration
const sessionConfig = {
  store: new MSSQLStore({
    server: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 1433,
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'clinic_db',
    options: {
      encrypt: true,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    table: 'sessions',
    ttl: 86400000, // 24 hours
    autoRemove: 'interval',
    autoRemoveInterval: 3600000, // 1 hour
    createDatabaseTable: true // Enable automatic table creation
  }),
  secret: process.env.SESSION_SECRET || 'your-session-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
};

app.use(session(sessionConfig));

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'Public')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', authenticateToken, adminRoutes);
app.use('/api/nurse', authenticateToken, nurseRoutes);
app.use('/api/student', authenticateToken, studentRoutes);

// Serve static files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port at http://localhost:${PORT}`);
});

module.exports = app;