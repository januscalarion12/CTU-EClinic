const express = require('express');
const router = express.Router();
const db = require('../db');
const { authorizeRole } = require('../middleware/auth');

// Get student profile
router.get('/profile', authorizeRole(['student']), async (req, res) => {
  try {
    const studentId = req.user.id;
    const [rows] = await db.execute(`
      SELECT s.*, u.name, u.email
      FROM students s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
    `, [studentId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Student not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ message: 'Error fetching profile' });
  }
});

// Update student profile
router.put('/profile', authorizeRole(['student']), async (req, res) => {
  try {
    const studentId = req.user.id;
    const { name, email, phone, address, emergency_contact } = req.body;

    // Update user table
    if (name || email) {
      await db.execute(
        'UPDATE users SET name = ?, email = ? WHERE id = (SELECT user_id FROM students WHERE id = ?)',
        [name, email, studentId]
      );
    }

    // Update student table
    await db.execute(
      'UPDATE students SET phone = ?, address = ?, emergency_contact = ? WHERE id = ?',
      [phone, address, emergency_contact, studentId]
    );

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Error updating profile' });
  }
});

// Get student's bookings
router.get('/bookings', authorizeRole(['student']), async (req, res) => {
  try {
    const studentId = req.user.id;
    const [rows] = await db.execute(`
      SELECT b.*, n.name as nurse_name
      FROM bookings b
      JOIN nurses n ON b.nurse_id = n.id
      WHERE b.student_id = ?
      ORDER BY b.appointment_date DESC
    `, [studentId]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ message: 'Error fetching bookings' });
  }
});

// Create booking
router.post('/bookings', authorizeRole(['student']), async (req, res) => {
  try {
    const { nurseId, appointmentDate, reason } = req.body;
    const studentId = req.user.id;

    const [result] = await db.execute(
      'INSERT INTO bookings (student_id, nurse_id, appointment_date, reason, status) VALUES (?, ?, ?, ?, ?)',
      [studentId, nurseId, appointmentDate, reason, 'pending']
    );

    res.status(201).json({ message: 'Booking created successfully', bookingId: result.insertId });
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ message: 'Error creating booking' });
  }
});

// Get student's reports
router.get('/reports', authorizeRole(['student']), async (req, res) => {
  try {
    const studentId = req.user.id;
    const [rows] = await db.execute(`
      SELECT r.*, n.name as nurse_name
      FROM reports r
      JOIN nurses n ON r.nurse_id = n.id
      WHERE r.student_id = ?
      ORDER BY r.created_at DESC
    `, [studentId]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ message: 'Error fetching reports' });
  }
});

// Get available nurses
router.get('/nurses', authorizeRole(['student']), async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT id, name, specialization FROM nurses');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching nurses:', error);
    res.status(500).json({ message: 'Error fetching nurses' });
  }
});

module.exports = router;