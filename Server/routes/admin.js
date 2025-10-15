const express = require('express');
const router = express.Router();
const db = require('../db');
const { authorizeRole } = require('../middleware/auth');

// Get all users
router.get('/users', authorizeRole(['admin']), async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT id, name, email, role, created_at FROM users');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// Get dashboard stats
router.get('/stats', authorizeRole(['admin']), async (req, res) => {
  try {
    const [userStats] = await db.execute('SELECT role, COUNT(*) as count FROM users GROUP BY role');
    const [bookingStats] = await db.execute('SELECT status, COUNT(*) as count FROM bookings GROUP BY status');
    const [reportStats] = await db.execute('SELECT COUNT(*) as total_reports FROM reports');

    res.json({
      users: userStats,
      bookings: bookingStats,
      reports: reportStats[0].total_reports
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ message: 'Error fetching stats' });
  }
});

// Delete user
router.delete('/users/:id', authorizeRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Error deleting user' });
  }
});

module.exports = router;