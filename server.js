require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./Server/db');
const authRoutes = require('./Server/routes/auth');
const adminRoutes = require('./Server/routes/admin');
const nurseRoutes = require('./Server/routes/nurse');
const studentRoutes = require('./Server/routes/student');
const { authenticateToken } = require('./Server/middleware/auth');

const app = express();

// Middleware
app.use(cors());
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