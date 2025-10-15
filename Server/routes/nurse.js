const express = require('express');
const router = express.Router();
const db = require('../db');
const { authorizeRole } = require('../middleware/auth');
const { generateQRCode } = require('../utils/qr');

// Get nurse's students
router.get('/students', authorizeRole(['nurse']), async (req, res) => {
  try {
    const nurseId = req.user.id;
    const [rows] = await db.execute(`
      SELECT s.id, s.name, s.email, s.student_id, s.qr_code
      FROM students s
      JOIN nurse_students ns ON s.id = ns.student_id
      WHERE ns.nurse_id = ?
    `, [nurseId]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ message: 'Error fetching students' });
  }
});

// Add student to nurse
router.post('/students', authorizeRole(['nurse']), async (req, res) => {
  try {
    const { studentId } = req.body;
    const nurseId = req.user.id;

    // Check if student exists
    const [students] = await db.execute('SELECT id FROM students WHERE id = ?', [studentId]);
    if (students.length === 0) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Check if already assigned
    const [existing] = await db.execute(
      'SELECT id FROM nurse_students WHERE nurse_id = ? AND student_id = ?',
      [nurseId, studentId]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Student already assigned to this nurse' });
    }

    await db.execute(
      'INSERT INTO nurse_students (nurse_id, student_id) VALUES (?, ?)',
      [nurseId, studentId]
    );

    res.status(201).json({ message: 'Student assigned successfully' });
  } catch (error) {
    console.error('Error assigning student:', error);
    res.status(500).json({ message: 'Error assigning student' });
  }
});

// Generate QR code for student
router.post('/students/:id/qr', authorizeRole(['nurse']), async (req, res) => {
  try {
    const studentId = req.params.id;
    const nurseId = req.user.id;

    // Verify nurse has access to this student
    const [access] = await db.execute(
      'SELECT id FROM nurse_students WHERE nurse_id = ? AND student_id = ?',
      [nurseId, studentId]
    );
    if (access.length === 0) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const qrData = `student:${studentId}:${Date.now()}`;
    const qrCode = await generateQRCode(qrData);

    await db.execute('UPDATE students SET qr_code = ? WHERE id = ?', [qrCode, studentId]);

    res.json({ qrCode });
  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).json({ message: 'Error generating QR code' });
  }
});

// Get nurse's reports
router.get('/reports', authorizeRole(['nurse']), async (req, res) => {
  try {
    const nurseId = req.user.id;
    const [rows] = await db.execute(`
      SELECT r.*, s.name as student_name
      FROM reports r
      JOIN students s ON r.student_id = s.id
      JOIN nurse_students ns ON s.id = ns.student_id
      WHERE ns.nurse_id = ?
      ORDER BY r.created_at DESC
    `, [nurseId]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ message: 'Error fetching reports' });
  }
});

// Create report
router.post('/reports', authorizeRole(['nurse']), async (req, res) => {
  try {
    const { studentId, reportType, description } = req.body;
    const nurseId = req.user.id;

    // Verify nurse has access to this student
    const [access] = await db.execute(
      'SELECT id FROM nurse_students WHERE nurse_id = ? AND student_id = ?',
      [nurseId, studentId]
    );
    if (access.length === 0) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const [result] = await db.execute(
      'INSERT INTO reports (student_id, nurse_id, report_type, description) VALUES (?, ?, ?, ?)',
      [studentId, nurseId, reportType, description]
    );

    res.status(201).json({ message: 'Report created successfully', reportId: result.insertId });
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({ message: 'Error creating report' });
  }
});

module.exports = router;