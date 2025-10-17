const express = require('express');
const router = express.Router();
const { poolPromise, sql } = require('../db');
const { authorizeRole } = require('../middleware/auth');
const { generateQRCode } = require('../utils/qr');
const { sendAppointmentStatusEmail } = require('../Utils/mailer');

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
      SELECT id, nurse_id, availability_date, start_time, end_time, max_patients, is_available
      FROM nurse_availability
      WHERE nurse_id = @nurse_id
    `;
    let request = pool.request().input('nurse_id', sql.Int, nurseId);

    if (date) {
      query += ' AND availability_date = @date';
      request = request.input('date', sql.Date, date);
    }

    query += ' ORDER BY availability_date, start_time';

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
        WHERE nurse_id = @nurse_id AND availability_date = @date
      `);

    if (existing.recordset.length > 0) {
      // Update existing
      const updateRequest = pool.request();
        await updateRequest
          .input('id', sql.Int, existing.recordset[0].id)
          .input('start_time', sql.VarChar, startTime)
          .input('end_time', sql.VarChar, endTime)
          .input('max_patients', sql.Int, maxPatients)
          .query(`
            UPDATE nurse_availability
            SET start_time = @start_time,
                end_time = @end_time,
                max_patients = @max_patients,
                updated_at = GETDATE()
            WHERE id = @id
          `);

      res.json({ message: 'Availability updated successfully' });
    } else {
      // Create new
      const insertRequest = pool.request();
       await insertRequest
         .input('nurse_id', sql.Int, nurseId)
         .input('availability_date', sql.Date, date)
         .input('start_time', sql.VarChar, startTime)
         .input('end_time', sql.VarChar, endTime)
         .input('max_patients', sql.Int, maxPatients)
         .query(`
           INSERT INTO nurse_availability (nurse_id, availability_date, start_time, end_time, max_patients)
           VALUES (@nurse_id, @availability_date, @start_time, @end_time, @max_patients)
         `);

      res.status(201).json({ message: 'Availability created successfully' });
    }
  } catch (error) {
    console.error('Error saving availability:', error);
    if (error.message === 'Nurse profile not found') {
      return res.status(404).json({ message: error.message });
    }
    // Handle unique constraint violation
    if (error.code === 'EREQUEST' && error.number === 2627) {
      return res.status(409).json({ message: 'Availability for this date already exists. Please update the existing entry instead.' });
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
         SELECT id, nurse_id, availability_date, start_time, end_time, max_patients, is_available
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

    // First check if there are any appointments for this availability slot
    const checkAppointmentsRequest = pool.request();
    const appointmentsCheck = await checkAppointmentsRequest
      .input('id', sql.Int, id)
      .input('nurse_id', sql.Int, nurseId)
      .query(`
        SELECT COUNT(*) as appointment_count
        FROM appointments a
        INNER JOIN nurse_availability na ON a.nurse_id = na.nurse_id
          AND CAST(a.appointment_date AS DATE) = na.availability_date
          AND a.appointment_date >= DATEADD(hour, DATEPART(hour, na.start_time), DATEADD(minute, DATEPART(minute, na.start_time), CAST(CAST(a.appointment_date AS DATE) AS DATETIME2)))
          AND a.appointment_date < DATEADD(hour, DATEPART(hour, na.end_time), DATEADD(minute, DATEPART(minute, na.end_time), CAST(CAST(a.appointment_date AS DATE) AS DATETIME2)))
        WHERE na.id = @id AND na.nurse_id = @nurse_id
          AND a.status IN ('pending', 'confirmed')
      `);

    if (appointmentsCheck.recordset[0].appointment_count > 0) {
      return res.status(409).json({ message: 'Cannot delete availability slot with existing appointments. Please cancel all appointments first.' });
    }

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

// Get nurse's appointments
router.get('/appointments', authorizeRole(['nurse']), async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, date } = req.query;

    const nurseId = await getNurseId(userId);
    const pool = await poolPromise;

    let query = `
      SELECT
        a.id,
        a.student_id,
        s.name as student_name,
        s.student_id as student_number,
        a.appointment_date,
        a.reason,
        a.status,
        a.created_at,
        a.notes
      FROM appointments a
      INNER JOIN students s ON a.student_id = s.id
      WHERE a.nurse_id = @nurse_id
    `;

    const request = pool.request().input('nurse_id', sql.Int, nurseId);

    if (status) {
      query += ' AND a.status = @status';
      request.input('status', sql.VarChar, status);
    }

    if (date) {
      query += ' AND CAST(a.appointment_date AS DATE) = @date';
      request.input('date', sql.Date, date);
    }

    query += ' ORDER BY a.appointment_date DESC';

    const result = await request.query(query);
    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    if (error.message === 'Nurse profile not found') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error fetching appointments' });
  }
});

// Update appointment status (approve/reject)
router.put('/appointments/:id/status', authorizeRole(['nurse']), async (req, res) => {
  try {
    const userId = req.user.id;
    const appointmentId = req.params.id;
    const { status, notes } = req.body;

    if (!['confirmed', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be confirmed or cancelled.' });
    }

    const nurseId = await getNurseId(userId);
    const pool = await poolPromise;

    // First, verify the appointment belongs to this nurse
    const verifyRequest = pool.request();
    const verifyResult = await verifyRequest
      .input('appointment_id', sql.Int, appointmentId)
      .input('nurse_id', sql.Int, nurseId)
      .query(`
        SELECT a.id, a.student_id, s.name as student_name, a.appointment_date
        FROM appointments a
        INNER JOIN students s ON a.student_id = s.id
        WHERE a.id = @appointment_id AND a.nurse_id = @nurse_id
      `);

    if (verifyResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    const appointment = verifyResult.recordset[0];

    // Update appointment status
    const updateRequest = pool.request();
    await updateRequest
      .input('appointment_id', sql.Int, appointmentId)
      .input('status', sql.VarChar, status)
      .input('notes', sql.NVarChar, notes || null)
      .query(`
        UPDATE appointments
        SET status = @status, notes = @notes, updated_at = GETDATE()
        WHERE id = @appointment_id
      `);

    // Create notification for the student
    const notificationRequest = pool.request();
    const statusMessage = status === 'confirmed' ? 'confirmed' : 'cancelled';
    await notificationRequest
      .input('user_id', sql.Int, appointment.student_id)
      .input('title', sql.NVarChar, `Appointment ${statusMessage}`)
      .input('message', sql.NVarChar, `Your appointment on ${new Date(appointment.appointment_date).toLocaleString()} has been ${statusMessage}.`)
      .input('type', sql.NVarChar, status === 'confirmed' ? 'appointment_confirmed' : 'appointment_cancelled')
      .input('related_id', sql.Int, appointmentId)
      .input('related_type', sql.NVarChar, 'appointment')
      .query(`
        INSERT INTO notifications (user_id, title, message, type, related_id, related_type)
        VALUES (@user_id, @title, @message, @type, @related_id, @related_type)
      `);

    // Send email notification to student
    try {
      const studentEmailRequest = pool.request();
      const studentEmailResult = await studentEmailRequest
        .input('student_id', sql.Int, appointment.student_id)
        .input('appointment_id', sql.Int, appointmentId)
        .query(`
          SELECT u.email, s.name as student_name, n.name as nurse_name, a.reason
          FROM students s
          INNER JOIN users u ON s.user_id = u.id
          INNER JOIN appointments a ON a.student_id = s.id
          INNER JOIN nurses n ON a.nurse_id = n.id
          WHERE s.id = @student_id AND a.id = @appointment_id
        `);

      if (studentEmailResult.recordset.length > 0) {
        const emailData = studentEmailResult.recordset[0];
        await sendAppointmentStatusEmail(emailData.email, {
          status: status,
          date: new Date(appointment.appointment_date).toLocaleDateString(),
          time: new Date(appointment.appointment_date).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          }),
          nurseName: emailData.nurse_name,
          reason: emailData.reason,
          notes: notes
        });
      }
    } catch (emailError) {
      console.error('Error sending appointment status email:', emailError);
      // Don't fail the status update if email fails
    }

    res.json({ message: `Appointment ${statusMessage} successfully` });
  } catch (error) {
    console.error('Error updating appointment status:', error);
    if (error.message === 'Nurse profile not found') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error updating appointment status' });
  }
});

// Get nurse dashboard statistics
router.get('/dashboard-stats', authorizeRole(['nurse']), async (req, res) => {
  try {
    const userId = req.user.id;
    const nurseId = await getNurseId(userId);
    const pool = await poolPromise;

    // Get today's appointments
    const todayAppointmentsRequest = pool.request();
    const todayAppointmentsResult = await todayAppointmentsRequest
      .input('nurse_id', sql.Int, nurseId)
      .input('today', sql.Date, new Date().toISOString().split('T')[0])
      .query(`
        SELECT COUNT(*) as count
        FROM appointments
        WHERE nurse_id = @nurse_id
          AND CAST(appointment_date AS DATE) = @today
          AND status IN ('confirmed', 'pending')
      `);

    // Get pending records (medical records that need attention)
    const pendingRecordsRequest = pool.request();
    const pendingRecordsResult = await pendingRecordsRequest
      .input('nurse_id', sql.Int, nurseId)
      .query(`
        SELECT COUNT(*) as count
        FROM medical_records mr
        JOIN appointments a ON mr.appointment_id = a.id
        WHERE a.nurse_id = @nurse_id
          AND mr.follow_up_required = 1
          AND (mr.follow_up_date IS NULL OR mr.follow_up_date >= GETDATE())
      `);

    // Get total students assigned to this nurse
    const totalStudentsRequest = pool.request();
    const totalStudentsResult = await totalStudentsRequest
      .input('nurse_id', sql.Int, nurseId)
      .query(`
        SELECT COUNT(*) as count
        FROM nurse_students
        WHERE nurse_id = @nurse_id AND is_active = 1
      `);

    // Get available slots for today
     const availableSlotsRequest = pool.request();
     const availableSlotsResult = await availableSlotsRequest
       .input('nurse_id', sql.Int, nurseId)
       .input('today', sql.Date, new Date().toISOString().split('T')[0])
       .query(`
         SELECT ISNULL(SUM(max_patients), 0) as total_slots
         FROM nurse_availability
         WHERE nurse_id = @nurse_id
           AND availability_date = @today
           AND is_available = 1
       `);

    // Get weekly appointments (last 7 days)
    const weeklyAppointmentsRequest = pool.request();
    const weeklyAppointmentsResult = await weeklyAppointmentsRequest
      .input('nurse_id', sql.Int, nurseId)
      .query(`
        SELECT COUNT(*) as count
        FROM appointments
        WHERE nurse_id = @nurse_id
          AND appointment_date >= DATEADD(day, -7, GETDATE())
          AND status IN ('confirmed', 'completed')
      `);

    // Get student visits (unique students seen in last 30 days)
    const studentVisitsRequest = pool.request();
    const studentVisitsResult = await studentVisitsRequest
      .input('nurse_id', sql.Int, nurseId)
      .query(`
        SELECT COUNT(DISTINCT student_id) as count
        FROM appointments
        WHERE nurse_id = @nurse_id
          AND appointment_date >= DATEADD(day, -30, GETDATE())
          AND status IN ('confirmed', 'completed')
      `);

    // Get average daily appointments (last 30 days)
    const avgDailyAppointmentsRequest = pool.request();
    const avgDailyAppointmentsResult = await avgDailyAppointmentsRequest
      .input('nurse_id', sql.Int, nurseId)
      .query(`
        SELECT ISNULL(AVG(daily_count), 0) as average
        FROM (
          SELECT CAST(appointment_date AS DATE) as date, COUNT(*) as daily_count
          FROM appointments
          WHERE nurse_id = @nurse_id
            AND appointment_date >= DATEADD(day, -30, GETDATE())
            AND status IN ('confirmed', 'completed')
          GROUP BY CAST(appointment_date AS DATE)
        ) daily_stats
      `);

    // Get monthly trend (percentage change from previous month)
    const monthlyTrendRequest = pool.request();
    const monthlyTrendResult = await monthlyTrendRequest
      .input('nurse_id', sql.Int, nurseId)
      .query(`
        WITH monthly_stats AS (
          SELECT
            YEAR(appointment_date) as year,
            MONTH(appointment_date) as month,
            COUNT(*) as appointment_count
          FROM appointments
          WHERE nurse_id = @nurse_id
            AND appointment_date >= DATEADD(month, -2, GETDATE())
            AND status IN ('confirmed', 'completed')
          GROUP BY YEAR(appointment_date), MONTH(appointment_date)
        ),
        current_month AS (
          SELECT appointment_count
          FROM monthly_stats
          WHERE year = YEAR(GETDATE()) AND month = MONTH(GETDATE())
        ),
        previous_month AS (
          SELECT appointment_count
          FROM monthly_stats
          WHERE year = YEAR(DATEADD(month, -1, GETDATE()))
            AND month = MONTH(DATEADD(month, -1, GETDATE()))
        )
        SELECT
          CASE
            WHEN prev.appointment_count = 0 THEN 100.0
            WHEN prev.appointment_count IS NULL THEN 100.0
            ELSE ((curr.appointment_count - prev.appointment_count) * 100.0 / prev.appointment_count)
          END as trend_percentage
        FROM current_month curr
        CROSS JOIN previous_month prev
      `);

    const stats = {
      todayAppointments: todayAppointmentsResult.recordset[0].count,
      pendingRecords: pendingRecordsResult.recordset[0].count,
      totalStudents: totalStudentsResult.recordset[0].count,
      availableSlots: availableSlotsResult.recordset[0].total_slots,
      weeklyAppointments: weeklyAppointmentsResult.recordset[0].count,
      studentVisits: studentVisitsResult.recordset[0].count,
      avgDailyAppointments: Math.round(avgDailyAppointmentsResult.recordset[0].average * 10) / 10,
      monthlyTrend: Math.round(monthlyTrendResult.recordset[0]?.trend_percentage || 0)
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    if (error.message === 'Nurse profile not found') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error fetching dashboard statistics' });
  }
});

// Get recent appointments overview
router.get('/appointments-overview', authorizeRole(['nurse']), async (req, res) => {
  try {
    const userId = req.user.id;
    const nurseId = await getNurseId(userId);
    const pool = await poolPromise;

    // Get upcoming appointments (next 7 days)
    const upcomingRequest = pool.request();
    const upcomingResult = await upcomingRequest
      .input('nurse_id', sql.Int, nurseId)
      .query(`
        SELECT TOP 5
          a.id,
          s.name as student_name,
          s.student_id,
          a.appointment_date,
          a.reason,
          a.status
        FROM appointments a
        INNER JOIN students s ON a.student_id = s.id
        WHERE a.nurse_id = @nurse_id
          AND a.appointment_date >= GETDATE()
          AND a.appointment_date <= DATEADD(day, 7, GETDATE())
          AND a.status IN ('confirmed', 'pending')
        ORDER BY a.appointment_date ASC
      `);

    // Get today's appointments
    const todayRequest = pool.request();
    const todayResult = await todayRequest
      .input('nurse_id', sql.Int, nurseId)
      .input('today', sql.Date, new Date().toISOString().split('T')[0])
      .query(`
        SELECT
          a.id,
          s.name as student_name,
          s.student_id,
          a.appointment_date,
          a.reason,
          a.status
        FROM appointments a
        INNER JOIN students s ON a.student_id = s.id
        WHERE a.nurse_id = @nurse_id
          AND CAST(a.appointment_date AS DATE) = @today
          AND a.status IN ('confirmed', 'pending')
        ORDER BY a.appointment_date ASC
      `);

    // Get appointment status summary
    const statusSummaryRequest = pool.request();
    const statusSummaryResult = await statusSummaryRequest
      .input('nurse_id', sql.Int, nurseId)
      .query(`
        SELECT
          status,
          COUNT(*) as count
        FROM appointments
        WHERE nurse_id = @nurse_id
          AND appointment_date >= DATEADD(day, -30, GETDATE())
        GROUP BY status
      `);

    const overview = {
      upcoming: upcomingResult.recordset,
      today: todayResult.recordset,
      statusSummary: statusSummaryResult.recordset.reduce((acc, curr) => {
        acc[curr.status] = curr.count;
        return acc;
      }, {})
    };

    res.json(overview);
  } catch (error) {
    console.error('Error fetching appointments overview:', error);
    if (error.message === 'Nurse profile not found') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error fetching appointments overview' });
  }
});

module.exports = router;
module.exports = router;