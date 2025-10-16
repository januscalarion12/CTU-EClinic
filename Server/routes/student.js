const express = require('express');
const router = express.Router();
const { poolPromise, sql } = require('../db');
const { authorizeRole } = require('../middleware/auth');
const { sendAppointmentRequestEmail } = require('../utils/mailer');

// Get student profile
router.get('/profile', authorizeRole(['student']), async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await poolPromise;

    const request = pool.request();
    const result = await request
      .input('user_id', sql.Int, userId)
      .query(`
        SELECT s.*, u.name, u.email
        FROM students s
        JOIN users u ON s.user_id = u.id
        WHERE s.user_id = @user_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Student not found' });
    }
    res.json(result.recordset[0]);
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
    const pool = await poolPromise;

    const request = pool.request();
    const result = await request
      .input('student_id', sql.Int, studentId)
      .query(`
        SELECT b.*, n.name as nurse_name
        FROM appointments b
        JOIN nurses n ON b.nurse_id = n.id
        WHERE b.student_id = @student_id
        ORDER BY b.appointment_date DESC
      `);

    res.json(result.recordset);
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

    // First, check if the student is assigned to this nurse
    const pool = await poolPromise;
    const checkRequest = pool.request();
    const assignmentResult = await checkRequest
      .input('student_id', sql.Int, studentId)
      .input('nurse_id', sql.Int, nurseId)
      .query(`
        SELECT id FROM nurse_students
        WHERE student_id = @student_id AND nurse_id = @nurse_id AND is_active = 1
      `);

    if (assignmentResult.recordset.length === 0) {
      return res.status(403).json({ message: 'You can only book appointments with your assigned nurses' });
    }

    // Check if the time slot is still available
    const availabilityCheck = pool.request();
    const availabilityResult = await availabilityCheck
      .input('nurse_id', sql.Int, nurseId)
      .input('appointment_date', sql.DateTime2, appointmentDate)
      .query(`
        SELECT na.max_patients,
               (SELECT COUNT(*) FROM appointments a
                WHERE a.nurse_id = na.nurse_id
                  AND CAST(a.appointment_date AS DATE) = CAST(@appointment_date AS DATE)
                  AND DATEPART(hour, a.appointment_date) = DATEPART(hour, @appointment_date)
                  AND DATEPART(minute, a.appointment_date) = DATEPART(minute, @appointment_date)
                  AND a.status IN ('pending', 'confirmed')) as booked_slots
        FROM nurse_availability na
        WHERE na.nurse_id = @nurse_id
          AND CAST(na.availability_date AS DATE) = CAST(@appointment_date AS DATE)
          AND na.start_time <= CAST(@appointment_date AS TIME)
          AND na.end_time > CAST(@appointment_date AS TIME)
          AND na.is_available = 1
      `);

    if (availabilityResult.recordset.length === 0) {
      return res.status(400).json({ message: 'Selected time slot is not available' });
    }

    const availability = availabilityResult.recordset[0];
    if (availability.booked_slots >= availability.max_patients) {
      return res.status(400).json({ message: 'Selected time slot is fully booked' });
    }

    const insertRequest = pool.request();
    const result = await insertRequest
      .input('student_id', sql.Int, studentId)
      .input('nurse_id', sql.Int, nurseId)
      .input('appointment_date', sql.DateTime2, appointmentDate)
      .input('reason', sql.NVarChar, reason)
      .query(`
        INSERT INTO appointments (student_id, nurse_id, appointment_date, reason, status)
        VALUES (@student_id, @nurse_id, @appointment_date, @reason, 'pending');
        SELECT SCOPE_IDENTITY() AS id;
      `);

    // Create notification for the nurse
    const notificationRequest = pool.request();
    await notificationRequest
      .input('user_id', sql.Int, nurseId)
      .input('title', sql.NVarChar, 'New Appointment Request')
      .input('message', sql.NVarChar, `A new appointment has been requested for ${new Date(appointmentDate).toLocaleString()}`)
      .input('type', sql.NVarChar, 'appointment_reminder')
      .input('related_id', sql.Int, result.recordset[0].id)
      .input('related_type', sql.NVarChar, 'appointment')
      .query(`
        INSERT INTO notifications (user_id, title, message, type, related_id, related_type)
        VALUES (@user_id, @title, @message, @type, @related_id, @related_type)
      `);

    // Send email notification to nurse
    try {
      const nurseEmailRequest = pool.request();
      const nurseEmailResult = await nurseEmailRequest
        .input('nurse_id', sql.Int, nurseId)
        .query(`
          SELECT u.email, n.name as nurse_name, s.name as student_name
          FROM nurses n
          INNER JOIN users u ON n.user_id = u.id
          INNER JOIN students s ON s.id = @student_id
          WHERE n.id = @nurse_id
        `);

      if (nurseEmailResult.recordset.length > 0) {
        const emailData = nurseEmailResult.recordset[0];
        await sendAppointmentRequestEmail(emailData.email, {
          studentName: emailData.student_name,
          date: new Date(appointmentDate).toLocaleDateString(),
          time: new Date(appointmentDate).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          }),
          reason: reason
        });
      }
    } catch (emailError) {
      console.error('Error sending appointment request email:', emailError);
      // Don't fail the booking if email fails
    }

    res.status(201).json({ message: 'Booking created successfully. Awaiting nurse approval.', bookingId: result.recordset[0].id });
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ message: 'Error creating booking' });
  }
});

// Get student's reports
router.get('/reports', authorizeRole(['student']), async (req, res) => {
  try {
    const studentId = req.user.id;
    const pool = await poolPromise;

    const request = pool.request();
    const result = await request
      .input('student_id', sql.Int, studentId)
      .query(`
        SELECT r.*, n.name as nurse_name
        FROM reports r
        JOIN nurses n ON r.nurse_id = n.id
        WHERE r.student_id = @student_id
        ORDER BY r.created_at DESC
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ message: 'Error fetching reports' });
  }
});

// Get available nurses (only assigned nurses)
router.get('/nurses', authorizeRole(['student']), async (req, res) => {
  try {
    const studentId = req.user.id;
    const pool = await poolPromise;

    const request = pool.request();
    const result = await request
      .input('student_id', sql.Int, studentId)
      .query(`
        SELECT n.id, n.name, n.specialization, n.license_number, n.phone, n.department, n.years_of_experience
        FROM nurses n
        INNER JOIN nurse_students ns ON n.id = ns.nurse_id
        WHERE ns.student_id = @student_id AND ns.is_active = 1
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching nurses:', error);
    res.status(500).json({ message: 'Error fetching nurses' });
  }
});

// Get availability of assigned nurses for a specific date
router.get('/availability', authorizeRole(['student']), async (req, res) => {
  try {
    const studentId = req.user.id;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: 'Date parameter is required' });
    }

    const pool = await poolPromise;

    const request = pool.request();
    const result = await request
      .input('student_id', sql.Int, studentId)
      .input('date', sql.Date, date)
      .query(`
        SELECT
          na.id,
          na.nurse_id,
          n.name as nurse_name,
          na.date,
          na.start_time,
          na.end_time,
          na.maxPatients,
          na.is_available,
          -- Count existing appointments for this nurse on this date
          (
            SELECT COUNT(*)
            FROM appointments a
            WHERE a.nurse_id = na.nurse_id
              AND CAST(a.appointment_date AS DATE) = na.date
              AND a.status IN ('pending', 'confirmed')
          ) as booked_slots
        FROM nurse_availability na
        INNER JOIN nurses n ON na.nurse_id = n.id
        INNER JOIN nurse_students ns ON n.id = ns.nurse_id
        WHERE ns.student_id = @student_id
          AND ns.is_active = 1
          AND na.date = @date
          AND na.is_available = 1
        ORDER BY n.name, na.start_time
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ message: 'Error fetching availability' });
  }
});

// Get student's notifications
router.get('/notifications', authorizeRole(['student']), async (req, res) => {
  try {
    const studentId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;

    const pool = await poolPromise;
    const request = pool.request();
    const result = await request
      .input('user_id', sql.Int, studentId)
      .input('limit', sql.Int, parseInt(limit))
      .input('offset', sql.Int, parseInt(offset))
      .query(`
        SELECT id, title, message, type, is_read, read_at, priority, created_at
        FROM notifications
        WHERE user_id = @user_id
        ORDER BY created_at DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Error fetching notifications' });
  }
});

// Mark notification as read
router.put('/notifications/:id/read', authorizeRole(['student']), async (req, res) => {
  try {
    const studentId = req.user.id;
    const notificationId = req.params.id;

    const pool = await poolPromise;
    const request = pool.request();
    const result = await request
      .input('id', sql.Int, notificationId)
      .input('user_id', sql.Int, studentId)
      .query(`
        UPDATE notifications
        SET is_read = 1, read_at = GETDATE()
        WHERE id = @id AND user_id = @user_id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ message: 'Error marking notification as read' });
  }
});

// Get unread notification count
router.get('/notifications/unread-count', authorizeRole(['student']), async (req, res) => {
  try {
    const studentId = req.user.id;

    const pool = await poolPromise;
    const request = pool.request();
    const result = await request
      .input('user_id', sql.Int, studentId)
      .query(`
        SELECT COUNT(*) as unread_count
        FROM notifications
        WHERE user_id = @user_id AND is_read = 0
      `);

    res.json({ unreadCount: result.recordset[0].unread_count });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ message: 'Error fetching unread count' });
  }
});

module.exports = router;