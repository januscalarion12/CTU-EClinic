const express = require('express');
const router = express.Router();
const { poolPromise, sql } = require('../db');
const { authorizeRole } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimiter');
const { sendAppointmentRequestEmail } = require('../utils/mailer');
const { generateQRCode } = require('../utils/qr');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/appointments');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, PDFs, and documents are allowed.'));
    }
  }
});

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
      .input('address', sql.NVarChar(sql.MAX), address || null)
      .input('emergency_contact', sql.VarChar, emergencyContact || null)
      .input('date_of_birth', sql.Date, dateOfBirth || null)
      .input('gender', sql.VarChar, gender || null)
      .input('blood_type', sql.VarChar, bloodType || null)
      .input('allergies', sql.NVarChar(sql.MAX), allergies || null)
      .input('medical_conditions', sql.NVarChar(sql.MAX), medicalConditions || null)
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

// Get student's bookings with pagination
router.get('/bookings', authorizeRole(['student']), async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10, offset = 0 } = req.query;

    // Get student record
    const pool = await poolPromise;
    const studentQuery = pool.request();
    const studentResult = await studentQuery
      .input('user_id', sql.Int, userId)
      .query('SELECT id FROM students WHERE user_id = @user_id');

    if (studentResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Student record not found' });
    }

    const studentId = studentResult.recordset[0].id;

    // Get total count
    const countRequest = pool.request();
    const countResult = await countRequest
      .input('student_id', sql.Int, studentId)
      .query(`
        SELECT COUNT(*) as total
        FROM appointments
        WHERE student_id = @student_id AND (CAST(notes AS NVARCHAR(MAX)) IS NULL OR CAST(notes AS NVARCHAR(MAX)) NOT LIKE '[[]ARCHIVED]%') AND status != 'archived'
      `);

    const total = countResult.recordset[0].total;

    // Get paginated results
    const request = pool.request();
    const result = await request
      .input('student_id', sql.Int, studentId)
      .input('limit', sql.Int, parseInt(limit))
      .input('offset', sql.Int, parseInt(offset))
      .query(`
        SELECT b.*, n.name as nurse_name, 
               FORMAT(b.appointment_date, 'yyyy-MM-ddTHH:mm:ss') as appointment_date_iso
        FROM appointments b
        JOIN nurses n ON b.nurse_id = n.id
        WHERE b.student_id = @student_id AND (CAST(b.notes AS NVARCHAR(MAX)) IS NULL OR CAST(b.notes AS NVARCHAR(MAX)) NOT LIKE '[[]ARCHIVED]%') AND b.status != 'archived'
        ORDER BY b.appointment_date DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    const formattedAppointments = result.recordset.map(apt => ({
        ...apt,
        appointment_date: apt.appointment_date_iso // Use the formatted string to avoid timezone shifts
    }));

    res.json({
      appointments: formattedAppointments,
      pagination: {
        total: total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < total
      }
    });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ message: 'Error fetching bookings' });
  }
});

// Get specific appointment details with QR code
router.get('/appointments/:id', authorizeRole(['student']), async (req, res) => {
  try {
    const userId = req.user.id;
    const appointmentId = req.params.id;

    // Get student record
    const pool = await poolPromise;
    const studentQuery = pool.request();
    const studentResult = await studentQuery
      .input('user_id', sql.Int, userId)
      .query('SELECT id FROM students WHERE user_id = @user_id');

    if (studentResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Student record not found' });
    }

    const studentId = studentResult.recordset[0].id;

    const request = pool.request();
    const result = await request
      .input('appointment_id', sql.Int, appointmentId)
      .input('student_id', sql.Int, studentId)
      .query(`
        SELECT a.*, n.name as nurse_name,
               FORMAT(a.appointment_date, 'yyyy-MM-ddTHH:mm:ss') as appointment_date_iso
        FROM appointments a
        JOIN nurses n ON a.nurse_id = n.id
        WHERE a.id = @appointment_id AND a.student_id = @student_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    const appointment = result.recordset[0];
    appointment.appointment_date = appointment.appointment_date_iso || appointment.appointment_date;
    
    res.json(appointment);
  } catch (error) {
    console.error('Error fetching appointment:', error);
    res.status(500).json({ message: 'Error fetching appointment' });
  }
});

// Create booking
router.post('/bookings', authorizeRole(['student']), rateLimit(), upload.array('attachments', 5), async (req, res) => {
  try {
    const { nurseId, appointmentDate, reason, urgency = 'normal', symptoms, additionalNotes } = req.body;
    const userId = req.user.id;

    // Get student record
    const pool = await poolPromise;
    const studentQuery = pool.request();
    const studentResult = await studentQuery
      .input('user_id', sql.Int, userId)
      .query('SELECT id FROM students WHERE user_id = @user_id');

    if (studentResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Student record not found' });
    }

    const studentId = studentResult.recordset[0].id;

    console.log('Resolved student ID:', studentId);

    // Handle attachments
    let attachments = null;
    if (req.files && req.files.length > 0) {
      attachments = JSON.stringify(req.files.map(file => ({
        filename: file.filename,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path
      })));
    }

    const notes = symptoms ? `Symptoms: ${symptoms}\n\nAdditional Notes: ${additionalNotes || ''}` : additionalNotes || '';

    console.log('Booking attempt:', { nurseId, appointmentDate, studentId });

    const bookingDate = new Date(appointmentDate);
    const dayOfWeek = bookingDate.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const dateStr = bookingDate.toISOString().split('T')[0];

    // Define Philippine holidays (keep consistent with available-dates)
    const philippineHolidays = [
      '2026-01-01', '2026-04-09', '2026-04-18', '2026-04-19', '2026-04-20',
      '2026-05-01', '2026-06-12', '2026-08-25', '2026-11-30', '2026-12-25', '2026-12-30', '2026-12-31'
    ];

    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return res.status(400).json({ message: 'Appointments cannot be booked on weekends.' });
    }

    if (philippineHolidays.includes(dateStr)) {
      return res.status(400).json({ message: 'Appointments cannot be booked on holidays.' });
    }

    // Check if the time slot is still available
    const availabilityCheck = pool.request();
    const availabilityResult = await availabilityCheck
      .input('nurse_id', sql.Int, nurseId)
      .input('appointment_date', sql.NVarChar, appointmentDate)
      .query(`
        SELECT na.max_patients,
               (SELECT COUNT(*) FROM appointments a
                WHERE a.nurse_id = na.nurse_id
                  AND CAST(a.appointment_date AS DATE) = CAST(@appointment_date AS DATE)
                  AND a.appointment_date >= DATEADD(hour, DATEPART(hour, CAST(na.start_time AS TIME)), DATEADD(minute, DATEPART(minute, CAST(na.start_time AS TIME)), CAST(CAST(@appointment_date AS DATE) AS DATETIME2)))
                  AND a.appointment_date < DATEADD(hour, DATEPART(hour, CAST(na.end_time AS TIME)), DATEADD(minute, DATEPART(minute, CAST(na.end_time AS TIME)), CAST(CAST(@appointment_date AS DATE) AS DATETIME2)))
                  AND a.status IN ('pending', 'confirmed')) as booked_slots
        FROM nurse_availability na
        WHERE na.nurse_id = @nurse_id
          AND CAST(na.availability_date AS DATE) = CAST(@appointment_date AS DATE)
          AND CAST(na.start_time AS TIME) <= CAST(CAST(@appointment_date AS DATETIME2) AS TIME)
          AND CAST(na.end_time AS TIME) > CAST(CAST(@appointment_date AS DATETIME2) AS TIME)
          AND na.is_available = 1
      `);

    console.log('Availability result:', availabilityResult.recordset);

    if (availabilityResult.recordset.length === 0) {
      return res.status(400).json({ message: 'This time slot is not available. Please select a different time.' });
    }

    const availability = availabilityResult.recordset[0];
    if (availability.booked_slots >= availability.max_patients) {
      return res.status(409).json({
        message: 'This time slot is fully booked. Would you like to join the waiting list?',
        waitingList: true,
        nurseId: nurseId,
        appointmentDate: appointmentDate,
        reason: reason
      });
    }

    // Check if the student already has an appointment at this exact time
    const duplicateCheck = pool.request();
    const duplicateResult = await duplicateCheck
      .input('student_id', sql.Int, studentId)
      .input('appointment_date', sql.NVarChar, appointmentDate)
      .query(`
        SELECT id FROM appointments 
        WHERE student_id = @student_id 
        AND appointment_date = @appointment_date 
        AND status IN ('pending', 'confirmed')
      `);

    if (duplicateResult.recordset.length > 0) {
      return res.status(400).json({ message: 'You already have an appointment booked for this time.' });
    }

    const insertRequest = pool.request();
    const result = await insertRequest
      .input('student_id', sql.Int, studentId)
      .input('nurse_id', sql.Int, nurseId)
      .input('appointment_date', sql.NVarChar, appointmentDate)
      .input('reason', sql.NVarChar, reason)
      .input('notes', sql.NVarChar, notes || null)
      .query(`
        INSERT INTO appointments (student_id, nurse_id, appointment_date, reason, notes, status)
        VALUES (@student_id, @nurse_id, @appointment_date, @reason, @notes, 'pending');
        SELECT SCOPE_IDENTITY() AS id;
      `);

    const appointmentId = result.recordset[0].id;

    // Generate QR code for the appointment
    const qrData = `appointment:${appointmentId}:${studentId}:${Date.now()}`;
    const qrCode = await generateQRCode(qrData);

    // Update appointment with QR code
    const updateQrRequest = pool.request();
    await updateQrRequest
      .input('qr_code', sql.NVarChar, qrCode)
      .input('appointment_id', sql.Int, appointmentId)
      .query(`
        UPDATE appointments
        SET qr_code = @qr_code
        WHERE id = @appointment_id
      `);

    // Get nurse's user_id for notification
    const nurseUserIdRequest = pool.request();
    const nurseUserIdResult = await nurseUserIdRequest
      .input('nurse_id', sql.Int, nurseId)
      .query(`SELECT user_id FROM nurses WHERE id = @nurse_id`);

    if (nurseUserIdResult.recordset.length === 0) {
      throw new Error('Nurse not found');
    }

    const nurseUserId = nurseUserIdResult.recordset[0].user_id;

    // Create notification for the nurse
    const notificationRequest = pool.request();
    await notificationRequest
      .input('user_id', sql.Int, nurseUserId)
      .input('title', sql.NVarChar, 'New Appointment Request')
      .input('message', sql.NVarChar, `A new appointment has been requested for ${new Date(appointmentDate).toLocaleString()}`)
      .input('type', sql.NVarChar, 'appointment_reminder')
      .input('related_id', sql.Int, appointmentId)
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
        .input('student_id', sql.Int, studentId)
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

    res.status(201).json({
      message: 'Booking created successfully. Awaiting nurse approval.',
      bookingId: appointmentId,
      qrCode: qrCode
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ message: 'Error creating booking' });
  }
});

// Get student's reports
router.get('/reports', authorizeRole(['student']), async (req, res) => {
  try {
    const userId = req.user.id;

    // Get student record
    const pool = await poolPromise;
    const studentQuery = pool.request();
    const studentResult = await studentQuery
      .input('user_id', sql.Int, userId)
      .query('SELECT id FROM students WHERE user_id = @user_id');

    if (studentResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Student record not found' });
    }

    const studentId = studentResult.recordset[0].id;

    const request = pool.request();
    const result = await request
      .input('student_id', sql.Int, studentId)
      .query(`
        SELECT r.*, n.name as nurse_name
        FROM reports r
        JOIN nurses n ON r.nurse_id = n.id
        WHERE r.student_id = @student_id AND r.report_type NOT LIKE '%_archived'
        ORDER BY r.created_at DESC
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ message: 'Error fetching reports' });
  }
});

// Get available nurses (all active nurses)
router.get('/nurses', authorizeRole(['student']), async (req, res) => {
  try {
    const pool = await poolPromise;
    const request = pool.request();
    const result = await request
      .query(`
        SELECT id, name, specialization, license_number, phone, department, years_of_experience
        FROM nurses
        WHERE is_active = 1
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching nurses:', error);
    res.status(500).json({ message: 'Error fetching nurses' });
  }
});

// Get available dates for nurses in a date range
router.get('/available-dates', authorizeRole(['student']), async (req, res) => {
  try {
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({ message: 'Start and end date parameters are required' });
    }

    const pool = await poolPromise;

    // Define Philippine holidays (add more as needed)
    const philippineHolidays = [
      '2026-01-01', // New Year's Day
      '2026-04-09', // Araw ng Kagitingan
      '2026-04-18', // Maundy Thursday
      '2026-04-19', // Good Friday
      '2026-04-20', // Black Saturday
      '2026-05-01', // Labor Day
      '2026-06-12', // Independence Day
      '2026-08-25', // National Heroes Day
      '2026-11-30', // Bonifacio Day
      '2026-12-25', // Christmas Day
      '2026-12-30', // Rizal Day
      '2026-12-31', // New Year's Eve
      // Add more holidays for 2026
    ];

    const request = pool.request();
    const result = await request
      .input('start_date', sql.Date, start)
      .input('end_date', sql.Date, end)
      .query(`
        SELECT DISTINCT
          na.availability_date,
          COUNT(*) as available_slots
        FROM nurse_availability na
        WHERE na.availability_date BETWEEN @start_date AND @end_date
          AND na.is_available = 1
          AND DATEPART(WEEKDAY, na.availability_date) NOT IN (1, 7) -- Exclude Sunday (1) and Saturday (7)
          AND CONVERT(VARCHAR(10), na.availability_date, 23) NOT IN (${philippineHolidays.map(h => `'${h}'`).join(', ')})
          AND na.max_patients > (
            SELECT COUNT(*)
            FROM appointments a
            WHERE a.nurse_id = na.nurse_id
              AND CAST(a.appointment_date AS DATE) = na.availability_date
              AND a.appointment_date >= DATEADD(hour, DATEPART(hour, CAST(na.start_time AS TIME)), DATEADD(minute, DATEPART(minute, CAST(na.start_time AS TIME)), CAST(na.availability_date AS DATETIME2)))
              AND a.appointment_date < DATEADD(hour, DATEPART(hour, CAST(na.end_time AS TIME)), DATEADD(minute, DATEPART(minute, CAST(na.end_time AS TIME)), CAST(na.availability_date AS DATETIME2)))
              AND a.status IN ('pending', 'confirmed')
          )
        GROUP BY na.availability_date
        ORDER BY na.availability_date
      `);

    const dates = result.recordset.map(row => row.availability_date.toISOString().split('T')[0]);
    res.json(dates);
  } catch (error) {
    console.error('Error fetching available dates:', error);
    res.status(500).json({ message: 'Error fetching available dates' });
  }
});

// Get availability of nurses for a specific date
router.get('/availability', authorizeRole(['student']), async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: 'Date parameter is required' });
    }

    // Check if the date is a weekend or holiday
    const dateObj = new Date(date);
    const dayOfWeek = dateObj.getUTCDay(); // 0 = Sunday, 6 = Saturday

    // Philippine holidays (same as above)
    const philippineHolidays = [
      '2026-01-01', '2026-04-09', '2026-04-18', '2026-04-19', '2026-04-20',
      '2026-05-01', '2026-06-12', '2026-08-25', '2026-11-30', '2026-12-25', '2026-12-30', '2026-12-31'
    ];

    const dateStr = dateObj.toISOString().split('T')[0];
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = philippineHolidays.includes(dateStr);

    if (isWeekend || isHoliday) {
      return res.json([]); // No availability on weekends or holidays
    }

    const pool = await poolPromise;

    const request = pool.request();
    const result = await request
      .input('date', sql.Date, date)
      .query(`
        SELECT
          na.id,
          na.nurse_id,
          n.name as nurse_name,
          na.availability_date,
          CONVERT(VARCHAR(8), na.start_time, 108) as start_time,
          CONVERT(VARCHAR(8), na.end_time, 108) as end_time,
          na.max_patients,
          na.is_available,
          -- Count existing appointments for this nurse on this date within the time slot
          (
            SELECT COUNT(*)
            FROM appointments a
            WHERE a.nurse_id = na.nurse_id
              AND CAST(a.appointment_date AS DATE) = na.availability_date
              AND a.appointment_date >= DATEADD(hour, DATEPART(hour, CAST(na.start_time AS TIME)), DATEADD(minute, DATEPART(minute, CAST(na.start_time AS TIME)), CAST(na.availability_date AS DATETIME2)))
              AND a.appointment_date < DATEADD(hour, DATEPART(hour, CAST(na.end_time AS TIME)), DATEADD(minute, DATEPART(minute, CAST(na.end_time AS TIME)), CAST(na.availability_date AS DATETIME2)))
              AND a.status IN ('pending', 'confirmed')
          ) as booked_slots
        FROM nurse_availability na
        INNER JOIN nurses n ON na.nurse_id = n.id
        WHERE na.availability_date = @date
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
    const userId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;

    const pool = await poolPromise;
    const request = pool.request();
    const result = await request
      .input('user_id', sql.Int, userId)
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
    const userId = req.user.id;
    const notificationId = req.params.id;

    const pool = await poolPromise;
    const request = pool.request();
    const result = await request
      .input('id', sql.Int, notificationId)
      .input('user_id', sql.Int, userId)
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

// Join waiting list for fully booked appointment
router.post('/waiting-list', authorizeRole(['student']), rateLimit(), async (req, res) => {
  try {
    const { nurseId, appointmentDate, reason } = req.body;
    const userId = req.user.id;

    // Get student record
    const pool = await poolPromise;
    const studentQuery = pool.request();
    const studentResult = await studentQuery
      .input('user_id', sql.Int, userId)
      .query('SELECT id FROM students WHERE user_id = @user_id');

    if (studentResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Student record not found' });
    }

    const studentId = studentResult.recordset[0].id;

    // Check if student is already on waiting list for this slot
    const existingRequest = pool.request();
    const existingResult = await existingRequest
      .input('student_id', sql.Int, studentId)
      .input('nurse_id', sql.Int, nurseId)
      .input('requested_date', sql.Date, new Date(appointmentDate).toISOString().split('T')[0])
      .query(`
        SELECT id FROM appointment_waiting_list
        WHERE student_id = @student_id AND nurse_id = @nurse_id
          AND requested_date = @requested_date AND status = 'waiting'
      `);

    if (existingResult.recordset.length > 0) {
      return res.status(400).json({ message: 'You are already on the waiting list for this time slot' });
    }

    // Add to waiting list
    const insertRequest = pool.request();
    const result = await insertRequest
      .input('student_id', sql.Int, studentId)
      .input('nurse_id', sql.Int, nurseId)
      .input('requested_date', sql.Date, new Date(appointmentDate).toISOString().split('T')[0])
      .input('requested_time', sql.Time, new Date(appointmentDate).toTimeString().slice(0, 8))
      .input('reason', sql.NVarChar, reason)
      .query(`
        INSERT INTO appointment_waiting_list (student_id, nurse_id, requested_date, requested_time, reason)
        VALUES (@student_id, @nurse_id, @requested_date, @requested_time, @reason);
        SELECT SCOPE_IDENTITY() AS id;
      `);

    const waitingListId = result.recordset[0].id;

    // Create notification for the student
    const notificationRequest = pool.request();
    await notificationRequest
      .input('user_id', sql.Int, studentId)
      .input('title', sql.NVarChar, 'Added to Waiting List')
      .input('message', sql.NVarChar, `You have been added to the waiting list for ${new Date(appointmentDate).toLocaleString()}. You will be notified if a slot becomes available.`)
      .input('type', sql.NVarChar, 'appointment_reminder')
      .input('related_id', sql.Int, waitingListId)
      .input('related_type', sql.NVarChar, 'waiting_list')
      .query(`
        INSERT INTO notifications (user_id, title, message, type, related_id, related_type)
        VALUES (@user_id, @title, @message, @type, @related_id, @related_type)
      `);

    res.status(201).json({
      message: 'Successfully added to waiting list. You will be notified if a slot becomes available.',
      waitingListId: waitingListId
    });
  } catch (error) {
    console.error('Error joining waiting list:', error);
    res.status(500).json({ message: 'Error joining waiting list' });
  }
});

// Reschedule appointment
router.put('/appointments/reschedule', authorizeRole(['student']), async (req, res) => {
  try {
    const { appointmentId, newDateTime, reason } = req.body;
    const userId = req.user.id;

    // Get student record
    const pool = await poolPromise;
    const studentQuery = pool.request();
    const studentResult = await studentQuery
      .input('user_id', sql.Int, userId)
      .query('SELECT id FROM students WHERE user_id = @user_id');

    if (studentResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Student record not found' });
    }

    const studentId = studentResult.recordset[0].id;

    // First, verify the appointment belongs to the student and is in confirmed status
    const verifyRequest = pool.request();
    const verifyResult = await verifyRequest
      .input('appointment_id', sql.Int, appointmentId)
      .input('student_id', sql.Int, studentId)
      .query(`
        SELECT a.*, n.name as nurse_name, n.user_id as nurse_user_id
        FROM appointments a
        JOIN nurses n ON a.nurse_id = n.id
        WHERE a.id = @appointment_id AND a.student_id = @student_id AND a.status = 'confirmed'
      `);

    if (verifyResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Appointment not found or not eligible for rescheduling' });
    }

    const appointment = verifyResult.recordset[0];

    // Check if the new time slot is available
    const bookingDate = new Date(newDateTime);
    const dayOfWeek = bookingDate.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const dateStr = bookingDate.toISOString().split('T')[0];

    // Define Philippine holidays
    const philippineHolidays = [
      '2026-01-01', '2026-04-09', '2026-04-18', '2026-04-19', '2026-04-20',
      '2026-05-01', '2026-06-12', '2026-08-25', '2026-11-30', '2026-12-25', '2026-12-30', '2026-12-31'
    ];

    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return res.status(400).json({ message: 'Appointments cannot be rescheduled to weekends.' });
    }

    if (philippineHolidays.includes(dateStr)) {
      return res.status(400).json({ message: 'Appointments cannot be rescheduled to holidays.' });
    }

    const availabilityCheck = pool.request();
    const availabilityResult = await availabilityCheck
      .input('nurse_id', sql.Int, appointment.nurse_id)
      .input('appointment_date', sql.NVarChar, newDateTime)
      .input('exclude_appointment_id', sql.Int, appointmentId)
      .query(`
        SELECT na.max_patients,
               (SELECT COUNT(*) FROM appointments a
                WHERE a.nurse_id = na.nurse_id
                  AND CAST(a.appointment_date AS DATE) = CAST(@appointment_date AS DATE)
                  AND a.appointment_date >= DATEADD(hour, DATEPART(hour, CAST(na.start_time AS TIME)), DATEADD(minute, DATEPART(minute, CAST(na.start_time AS TIME)), CAST(CAST(@appointment_date AS DATE) AS DATETIME2)))
                  AND a.appointment_date < DATEADD(hour, DATEPART(hour, CAST(na.end_time AS TIME)), DATEADD(minute, DATEPART(minute, CAST(na.end_time AS TIME)), CAST(CAST(@appointment_date AS DATE) AS DATETIME2)))
                  AND a.status IN ('pending', 'confirmed')
                  AND a.id != @exclude_appointment_id) as booked_slots
        FROM nurse_availability na
        WHERE na.nurse_id = @nurse_id
          AND CAST(na.availability_date AS DATE) = CAST(@appointment_date AS DATE)
          AND CAST(na.start_time AS TIME) <= CAST(CAST(@appointment_date AS DATETIME2) AS TIME)
          AND CAST(na.end_time AS TIME) > CAST(CAST(@appointment_date AS DATETIME2) AS TIME)
          AND na.is_available = 1
      `);

    if (availabilityResult.recordset.length === 0) {
      return res.status(400).json({ message: 'This time slot is not available' });
    }

    const availability = availabilityResult.recordset[0];
    if (availability.booked_slots >= availability.max_patients) {
      return res.status(400).json({ message: 'This time slot is fully booked' });
    }

    // Update the appointment
    const updateRequest = pool.request();
    await updateRequest
      .input('appointment_id', sql.Int, appointmentId)
      .input('new_date', sql.NVarChar, newDateTime)
      .input('reason', sql.NVarChar, reason)
      .query(`
        UPDATE appointments
        SET appointment_date = @new_date,
            updated_at = GETDATE()
        WHERE id = @appointment_id
      `);

    // Create notification for the nurse
    const notificationRequest = pool.request();
    await notificationRequest
      .input('user_id', sql.Int, appointment.nurse_user_id)
      .input('title', sql.NVarChar, 'Appointment Rescheduled')
      .input('message', sql.NVarChar, `An appointment has been rescheduled to ${new Date(newDateTime).toLocaleString()}. Reason: ${reason}`)
      .input('type', sql.NVarChar, 'appointment_reminder')
      .input('related_id', sql.Int, appointmentId)
      .input('related_type', sql.NVarChar, 'appointment')
      .query(`
        INSERT INTO notifications (user_id, title, message, type, related_id, related_type)
        VALUES (@user_id, @title, @message, @type, @related_id, @related_type)
      `);

    // Log the rescheduling
    const auditRequest = pool.request();
    await auditRequest
      .input('user_id', sql.Int, studentId)
      .input('action', sql.NVarChar, 'RESCHEDULE_APPOINTMENT')
      .input('table_name', sql.NVarChar, 'appointments')
      .input('record_id', sql.Int, appointmentId)
      .input('old_values', sql.NVarChar, JSON.stringify({ appointment_date: appointment.appointment_date }))
      .input('new_values', sql.NVarChar, JSON.stringify({ appointment_date: newDateTime, reason: reason }))
      .query(`
        INSERT INTO audit_log (user_id, action, table_name, record_id, old_values, new_values)
        VALUES (@user_id, @action, @table_name, @record_id, @old_values, @new_values)
      `);

    res.json({ message: 'Appointment rescheduled successfully' });
  } catch (error) {
    console.error('Error rescheduling appointment:', error);
    res.status(500).json({ message: 'Error rescheduling appointment' });
  }
});

// Cancel appointment
router.put('/appointments/cancel', authorizeRole(['student']), async (req, res) => {
  try {
    const { appointmentId } = req.body;
    const userId = req.user.id;

    // Get student record
    const pool = await poolPromise;
    const studentQuery = pool.request();
    const studentResult = await studentQuery
      .input('user_id', sql.Int, userId)
      .query('SELECT id FROM students WHERE user_id = @user_id');

    if (studentResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Student record not found' });
    }

    const studentId = studentResult.recordset[0].id;

    // First, verify the appointment belongs to the student and is in confirmed status
    const verifyRequest = pool.request();
    const verifyResult = await verifyRequest
      .input('appointment_id', sql.Int, appointmentId)
      .input('student_id', sql.Int, studentId)
      .query(`
        SELECT a.*, n.name as nurse_name, n.user_id as nurse_user_id
        FROM appointments a
        JOIN nurses n ON a.nurse_id = n.id
        WHERE a.id = @appointment_id AND a.student_id = @student_id AND a.status = 'confirmed'
      `);

    if (verifyResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Appointment not found or not eligible for cancellation' });
    }

    const appointment = verifyResult.recordset[0];

    // Update appointment status to cancelled
    const updateRequest = pool.request();
    await updateRequest
      .input('appointment_id', sql.Int, appointmentId)
      .query(`
        UPDATE appointments
        SET status = 'cancelled', updated_at = GETDATE()
        WHERE id = @appointment_id
      `);

    // Create notification for the nurse
    const notificationRequest = pool.request();
    await notificationRequest
      .input('user_id', sql.Int, appointment.nurse_user_id)
      .input('title', sql.NVarChar, 'Appointment Cancelled')
      .input('message', sql.NVarChar, `An appointment has been cancelled by the student for ${new Date(appointment.appointment_date).toLocaleString()}`)
      .input('type', sql.NVarChar, 'appointment_cancelled')
      .input('related_id', sql.Int, appointmentId)
      .input('related_type', sql.NVarChar, 'appointment')
      .query(`
        INSERT INTO notifications (user_id, title, message, type, related_id, related_type)
        VALUES (@user_id, @title, @message, @type, @related_id, @related_type)
      `);

    // Log the cancellation
    const auditRequest = pool.request();
    await auditRequest
      .input('user_id', sql.Int, studentId)
      .input('action', sql.NVarChar, 'CANCEL_APPOINTMENT')
      .input('table_name', sql.NVarChar, 'appointments')
      .input('record_id', sql.Int, appointmentId)
      .input('old_values', sql.NVarChar, JSON.stringify({ status: 'confirmed' }))
      .input('new_values', sql.NVarChar, JSON.stringify({ status: 'cancelled' }))
      .query(`
        INSERT INTO audit_log (user_id, action, table_name, record_id, old_values, new_values)
        VALUES (@user_id, @action, @table_name, @record_id, @old_values, @new_values)
      `);

    res.json({ message: 'Appointment cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    res.status(500).json({ message: 'Error cancelling appointment' });
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

// Get notification preferences
router.get('/notification-preferences', authorizeRole(['student']), async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await poolPromise;

    const request = pool.request();
    const result = await request
      .input('user_id', sql.Int, userId)
      .query(`
        SELECT * FROM notification_preferences WHERE user_id = @user_id
      `);

    if (result.recordset.length === 0) {
      // Create default preferences if none exist
      const insertRequest = pool.request();
      await insertRequest
        .input('user_id', sql.Int, userId)
        .query(`
          INSERT INTO notification_preferences (user_id)
          VALUES (@user_id)
        `);

      // Return default preferences
      res.json({
        email_notifications: true,
        sms_notifications: false,
        push_notifications: true,
        appointment_reminders: true,
        appointment_confirmations: true,
        appointment_cancellations: true,
        medical_record_updates: true,
        system_alerts: true
      });
    } else {
      res.json(result.recordset[0]);
    }
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    res.status(500).json({ message: 'Error fetching notification preferences' });
  }
});

// Update notification preferences
router.put('/notification-preferences', authorizeRole(['student']), async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      email_notifications,
      sms_notifications,
      push_notifications,
      appointment_reminders,
      appointment_confirmations,
      appointment_cancellations,
      medical_record_updates,
      system_alerts
    } = req.body;

    const pool = await poolPromise;

    // Check if preferences exist
    const checkRequest = pool.request();
    const checkResult = await checkRequest
      .input('user_id', sql.Int, userId)
      .query('SELECT id FROM notification_preferences WHERE user_id = @user_id');

    if (checkResult.recordset.length === 0) {
      // Insert new preferences
      const insertRequest = pool.request();
      await insertRequest
        .input('user_id', sql.Int, userId)
        .input('email_notifications', sql.Bit, email_notifications !== undefined ? email_notifications : true)
        .input('sms_notifications', sql.Bit, sms_notifications !== undefined ? sms_notifications : false)
        .input('push_notifications', sql.Bit, push_notifications !== undefined ? push_notifications : true)
        .input('appointment_reminders', sql.Bit, appointment_reminders !== undefined ? appointment_reminders : true)
        .input('appointment_confirmations', sql.Bit, appointment_confirmations !== undefined ? appointment_confirmations : true)
        .input('appointment_cancellations', sql.Bit, appointment_cancellations !== undefined ? appointment_cancellations : true)
        .input('medical_record_updates', sql.Bit, medical_record_updates !== undefined ? medical_record_updates : true)
        .input('system_alerts', sql.Bit, system_alerts !== undefined ? system_alerts : true)
        .query(`
          INSERT INTO notification_preferences (
            user_id, email_notifications, sms_notifications, push_notifications,
            appointment_reminders, appointment_confirmations, appointment_cancellations,
            medical_record_updates, system_alerts
          ) VALUES (
            @user_id, @email_notifications, @sms_notifications, @push_notifications,
            @appointment_reminders, @appointment_confirmations, @appointment_cancellations,
            @medical_record_updates, @system_alerts
          )
        `);
    } else {
      // Update existing preferences
      const updateRequest = pool.request();
      await updateRequest
        .input('user_id', sql.Int, userId)
        .input('email_notifications', sql.Bit, email_notifications !== undefined ? email_notifications : true)
        .input('sms_notifications', sql.Bit, sms_notifications !== undefined ? sms_notifications : false)
        .input('push_notifications', sql.Bit, push_notifications !== undefined ? push_notifications : true)
        .input('appointment_reminders', sql.Bit, appointment_reminders !== undefined ? appointment_reminders : true)
        .input('appointment_confirmations', sql.Bit, appointment_confirmations !== undefined ? appointment_confirmations : true)
        .input('appointment_cancellations', sql.Bit, appointment_cancellations !== undefined ? appointment_cancellations : true)
        .input('medical_record_updates', sql.Bit, medical_record_updates !== undefined ? medical_record_updates : true)
        .input('system_alerts', sql.Bit, system_alerts !== undefined ? system_alerts : true)
        .query(`
          UPDATE notification_preferences
          SET email_notifications = @email_notifications,
              sms_notifications = @sms_notifications,
              push_notifications = @push_notifications,
              appointment_reminders = @appointment_reminders,
              appointment_confirmations = @appointment_confirmations,
              appointment_cancellations = @appointment_cancellations,
              medical_record_updates = @medical_record_updates,
              system_alerts = @system_alerts,
              updated_at = GETDATE()
          WHERE user_id = @user_id
        `);
    }

    res.json({ message: 'Notification preferences updated successfully' });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({ message: 'Error updating notification preferences' });
  }
});

module.exports = router;
