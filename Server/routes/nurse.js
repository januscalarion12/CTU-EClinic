const express = require('express');
const router = express.Router();
const { poolPromise, sql } = require('../db');
const { authorizeRole } = require('../middleware/auth');
const { generateQRCode } = require('../utils/qr');

// Helper function to get nurse ID from user ID
async function getNurseId(userId) {
  const pool = await poolPromise;
  const nurseRequest = pool.request();
  const nurseResult = await nurseRequest
    .input('user_id', sql.Int, userId)
    .query('SELECT id FROM nurses WHERE user_id = @user_id');

  if (nurseResult.recordset.length === 0) {
    throw new Error('Nurse profile not found');
  }

  return nurseResult.recordset[0].id;
}

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

// Get nurse profile data
router.get('/profile/:userId', authorizeRole(['nurse']), async (req, res) => {
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
          name,
          email,
          specialization,
          license_number,
          phone,
          department,
          years_of_experience,
          is_active,
          created_at
        FROM nurses
        WHERE user_id = @user_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Nurse profile not found' });
    }

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error fetching nurse profile:', error);
    res.status(500).json({ message: 'Error fetching nurse profile' });
  }
});

// Update nurse profile
router.put('/profile', authorizeRole(['nurse']), async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      firstName,
      middleName,
      lastName,
      suffix,
      email,
      phone,
      specialization,
      department,
      yearsOfExperience,
      bio
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
      .input('contact_number', sql.VarChar, phone)
      .input('id', sql.Int, userId)
      .query(`
        UPDATE users
        SET first_name = @first_name,
            middle_name = @middle_name,
            last_name = @last_name,
            extension_name = @extension_name,
            email = @email,
            contact_number = @contact_number
        WHERE id = @id
      `);

    // Update nurses table
    const updateNurseRequest = pool.request();
    await updateNurseRequest
      .input('specialization', sql.VarChar, specialization || null)
      .input('phone', sql.VarChar, phone)
      .input('department', sql.VarChar, department || null)
      .input('years_of_experience', sql.Int, yearsOfExperience || null)
      .input('user_id', sql.Int, userId)
      .query(`
        UPDATE nurses
        SET specialization = @specialization,
            phone = @phone,
            department = @department,
            years_of_experience = @years_of_experience
        WHERE user_id = @user_id
      `);

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating nurse profile:', error);
    res.status(500).json({ message: 'Error updating nurse profile' });
  }
});

// Get nurse availability
router.get('/availability', authorizeRole(['nurse']), async (req, res) => {
  try {
    const userId = req.user.id;
    const { date } = req.query;

    const nurseId = await getNurseId(userId);
    const pool = await poolPromise;

    let query = `
      SELECT id, nurse_id, date, start_time, end_time, maxPatients, is_available
      FROM nurse_availability
      WHERE nurse_id = @nurse_id
    `;
    let request = pool.request().input('nurse_id', sql.Int, nurseId);

    if (date) {
      query += ' AND date = @date';
      request = request.input('date', sql.Date, date);
    }

    query += ' ORDER BY date, start_time';

    const result = await request.query(query);
    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching availability:', error);
    if (error.message === 'Nurse profile not found') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error fetching availability' });
  }
});

// Create/Update availability
router.post('/availability', authorizeRole(['nurse']), async (req, res) => {
  try {
    const userId = req.user.id;
    const { date, startTime, endTime, maxPatients } = req.body;

    const nurseId = await getNurseId(userId);
    const pool = await poolPromise;

    // Check if availability already exists for this date
    const existingRequest = pool.request();
    const existing = await existingRequest
      .input('nurse_id', sql.Int, nurseId)
      .input('date', sql.Date, date)
      .query(`
        SELECT id FROM nurse_availability
        WHERE nurse_id = @nurse_id AND date = @date
      `);

    if (existing.recordset.length > 0) {
      // Update existing
      const updateRequest = pool.request();
      await updateRequest
        .input('id', sql.Int, existing.recordset[0].id)
        .input('start_time', sql.VarChar, startTime)
        .input('end_time', sql.VarChar, endTime)
        .input('maxPatients', sql.Int, maxPatients)
        .query(`
          UPDATE nurse_availability
          SET start_time = @start_time,
              end_time = @end_time,
              maxPatients = @maxPatients,
              updated_at = GETDATE()
          WHERE id = @id
        `);

      res.json({ message: 'Availability updated successfully' });
    } else {
      // Create new
      const insertRequest = pool.request();
      await insertRequest
        .input('nurse_id', sql.Int, nurseId)
        .input('date', sql.Date, date)
        .input('start_time', sql.VarChar, startTime)
        .input('end_time', sql.VarChar, endTime)
        .input('maxPatients', sql.Int, maxPatients)
        .query(`
          INSERT INTO nurse_availability (nurse_id, date, start_time, end_time, maxPatients)
          VALUES (@nurse_id, @date, @start_time, @end_time, @maxPatients)
        `);

      res.status(201).json({ message: 'Availability created successfully' });
    }
  } catch (error) {
    console.error('Error saving availability:', error);
    if (error.message === 'Nurse profile not found') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error saving availability' });
  }
});

// Get specific availability slot
router.get('/availability/:id', authorizeRole(['nurse']), async (req, res) => {
  try {
    const userId = req.user.id;
    const id = req.params.id;

    const nurseId = await getNurseId(userId);
    const pool = await poolPromise;

    const request = pool.request();
    const result = await request
      .input('id', sql.Int, id)
      .input('nurse_id', sql.Int, nurseId)
      .query(`
        SELECT id, nurse_id, date, start_time, end_time, maxPatients, is_available
        FROM nurse_availability
        WHERE id = @id AND nurse_id = @nurse_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Availability slot not found' });
    }

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error fetching availability slot:', error);
    if (error.message === 'Nurse profile not found') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error fetching availability slot' });
  }
});

// Delete availability slot
router.delete('/availability/:id', authorizeRole(['nurse']), async (req, res) => {
  try {
    const userId = req.user.id;
    const id = req.params.id;

    const nurseId = await getNurseId(userId);
    const pool = await poolPromise;

    const request = pool.request();
    const result = await request
      .input('id', sql.Int, id)
      .input('nurse_id', sql.Int, nurseId)
      .query(`
        DELETE FROM nurse_availability
        WHERE id = @id AND nurse_id = @nurse_id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Availability slot not found' });
    }

    res.json({ message: 'Availability slot deleted successfully' });
  } catch (error) {
    console.error('Error deleting availability slot:', error);
    if (error.message === 'Nurse profile not found') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error deleting availability slot' });
  }
});

module.exports = router;