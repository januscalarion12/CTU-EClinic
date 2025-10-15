const express = require('express');
const router = express.Router();
const { poolPromise, sql } = require('../db');
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

// Get student profile data
router.get('/profile/:userId', authorizeRole(['student']), async (req, res) => {
  try {
    const userId = req.params.userId;
    const pool = await poolPromise;

    const request = pool.request();
    const result = await request
      .input('user_id', sql.Int, userId)
      .query(`
        SELECT
          id,
          user_id,
          student_id,
          name,
          email,
          phone,
          address,
          emergency_contact,
          date_of_birth,
          gender,
          blood_type,
          allergies,
          medical_conditions,
          school_year,
          school_level,
          department
        FROM students
        WHERE user_id = @user_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error fetching student profile:', error);
    res.status(500).json({ message: 'Error fetching student profile' });
  }
});

// Update student profile
router.put('/profile', authorizeRole(['student']), async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      firstName,
      middleName,
      lastName,
      suffix,
      email,
      contactNumber,
      schoolYear,
      schoolLevel,
      department,
      dateOfBirth,
      gender,
      bloodType,
      emergencyContact,
      address,
      allergies,
      medicalConditions
    } = req.body;

    const pool = await poolPromise;

    // Update users table
    const updateUserRequest = pool.request();
    await updateUserRequest
      .input('first_name', sql.VarChar, firstName)
      .input('middle_name', sql.VarChar, middleName || null)
      .input('last_name', sql.VarChar, lastName)
      .input('extension_name', sql.VarChar, suffix || null)
      .input('email', sql.VarChar, email)
      .input('contact_number', sql.VarChar, contactNumber)
      .input('school_year', sql.VarChar, schoolYear || null)
      .input('school_level', sql.VarChar, schoolLevel || null)
      .input('department', sql.VarChar, department || null)
      .input('id', sql.Int, userId)
      .query(`
        UPDATE users
        SET first_name = @first_name,
            middle_name = @middle_name,
            last_name = @last_name,
            extension_name = @extension_name,
            email = @email,
            contact_number = @contact_number,
            school_year = @school_year,
            school_level = @school_level,
            department = @department
        WHERE id = @id
      `);

    // Update students table
    const updateStudentRequest = pool.request();
    await updateStudentRequest
      .input('phone', sql.VarChar, contactNumber)
      .input('address', sql.Text, address || null)
      .input('emergency_contact', sql.VarChar, emergencyContact || null)
      .input('date_of_birth', sql.Date, dateOfBirth || null)
      .input('gender', sql.VarChar, gender || null)
      .input('blood_type', sql.VarChar, bloodType || null)
      .input('allergies', sql.Text, allergies || null)
      .input('medical_conditions', sql.Text, medicalConditions || null)
      .input('school_year', sql.VarChar, schoolYear || null)
      .input('school_level', sql.VarChar, schoolLevel || null)
      .input('department', sql.VarChar, department || null)
      .input('user_id', sql.Int, userId)
      .query(`
        UPDATE students
        SET phone = @phone,
            address = @address,
            emergency_contact = @emergency_contact,
            date_of_birth = @date_of_birth,
            gender = @gender,
            blood_type = @blood_type,
            allergies = @allergies,
            medical_conditions = @medical_conditions,
            school_year = @school_year,
            school_level = @school_level,
            department = @department
        WHERE user_id = @user_id
      `);

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