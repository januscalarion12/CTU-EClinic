const express = require('express');
const router = express.Router();
const { poolPromise, sql } = require('../db');
const { authorizeRole } = require('../middleware/auth');

// Generate appointment report
router.get('/appointments', authorizeRole(['nurse', 'admin']), async (req, res) => {
  try {
    const { startDate, endDate, status, nurseId, semester } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    const pool = await poolPromise;
    let query = `
      SELECT
        a.id,
        a.appointment_date,
        a.reason,
        a.status,
        a.created_at,
        s.name as student_name,
        s.student_id,
        s.school_year,
        s.school_level,
        s.department,
        n.name as nurse_name,
        n.specialization
      FROM appointments a
      JOIN students s ON a.student_id = s.id
      JOIN nurses n ON a.nurse_id = n.id
    `;

    const conditions = [];
    const request = pool.request();

    if (userRole === 'nurse') {
      // Nurses can only see their own appointments
      conditions.push('a.nurse_id = (SELECT id FROM nurses WHERE user_id = @user_id)');
      request.input('user_id', sql.Int, userId);
    } else if (nurseId) {
      conditions.push('a.nurse_id = @nurse_id');
      request.input('nurse_id', sql.Int, nurseId);
    }

    if (startDate) {
      conditions.push('CAST(a.appointment_date AS DATE) >= @start_date');
      request.input('start_date', sql.Date, startDate);
    }

    if (endDate) {
      conditions.push('CAST(a.appointment_date AS DATE) <= @end_date');
      request.input('end_date', sql.Date, endDate);
    }

    if (status) {
      conditions.push('a.status = @status');
      request.input('status', sql.VarChar, status);
    }

    if (semester) {
      // Assuming semester is stored in school_year or we can derive it
      conditions.push('s.school_year LIKE @semester');
      request.input('semester', sql.VarChar, `%${semester}%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY a.appointment_date DESC';

    const result = await request.query(query);

    res.json({
      reportType: 'Appointment Report',
      generatedAt: new Date().toISOString(),
      filters: { startDate, endDate, status, nurseId, semester },
      data: result.recordset
    });
  } catch (error) {
    console.error('Error generating appointment report:', error);
    res.status(500).json({ message: 'Error generating appointment report' });
  }
});

// Generate medical records report
router.get('/medical-records', authorizeRole(['nurse', 'admin']), async (req, res) => {
  try {
    const { startDate, endDate, recordType, studentId, nurseId, semester } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    const pool = await poolPromise;
    let query = `
      SELECT
        mr.id,
        mr.visit_date,
        mr.record_type,
        mr.symptoms,
        mr.diagnosis,
        mr.treatment,
        mr.medications,
        mr.vital_signs,
        mr.notes,
        mr.follow_up_required,
        mr.follow_up_date,
        mr.created_at,
        s.name as student_name,
        s.student_id,
        s.school_year,
        s.school_level,
        s.department,
        n.name as nurse_name,
        n.specialization
      FROM medical_records mr
      JOIN students s ON mr.student_id = s.id
      JOIN nurses n ON mr.nurse_id = n.id
    `;

    const conditions = [];
    const request = pool.request();

    if (userRole === 'nurse') {
      conditions.push('mr.nurse_id = (SELECT id FROM nurses WHERE user_id = @user_id)');
      request.input('user_id', sql.Int, userId);
    } else if (nurseId) {
      conditions.push('mr.nurse_id = @nurse_id');
      request.input('nurse_id', sql.Int, nurseId);
    }

    if (studentId) {
      conditions.push('mr.student_id = @student_id');
      request.input('student_id', sql.Int, studentId);
    }

    if (startDate) {
      conditions.push('CAST(mr.visit_date AS DATE) >= @start_date');
      request.input('start_date', sql.Date, startDate);
    }

    if (endDate) {
      conditions.push('CAST(mr.visit_date AS DATE) <= @end_date');
      request.input('end_date', sql.Date, endDate);
    }

    if (recordType) {
      conditions.push('mr.record_type = @record_type');
      request.input('record_type', sql.VarChar, recordType);
    }

    if (semester) {
      conditions.push('s.school_year LIKE @semester');
      request.input('semester', sql.VarChar, `%${semester}%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY mr.visit_date DESC';

    const result = await request.query(query);

    res.json({
      reportType: 'Medical Records Report',
      generatedAt: new Date().toISOString(),
      filters: { startDate, endDate, recordType, studentId, nurseId, semester },
      data: result.recordset
    });
  } catch (error) {
    console.error('Error generating medical records report:', error);
    res.status(500).json({ message: 'Error generating medical records report' });
  }
});

// Generate student reports
router.get('/students', authorizeRole(['nurse', 'admin']), async (req, res) => {
  try {
    const { department, schoolYear, schoolLevel, semester } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    const pool = await poolPromise;
    let query = `
      SELECT
        s.id,
        s.student_id,
        s.name,
        s.email,
        s.phone,
        s.school_year,
        s.school_level,
        s.department,
        s.date_of_birth,
        s.gender,
        s.blood_type,
        s.allergies,
        s.medical_conditions,
        s.created_at,
        COUNT(DISTINCT a.id) as total_appointments,
        COUNT(DISTINCT mr.id) as total_medical_records,
        COUNT(DISTINCT CASE WHEN a.status = 'completed' THEN a.id END) as completed_appointments,
        MAX(mr.visit_date) as last_visit_date
      FROM students s
      LEFT JOIN appointments a ON s.id = a.student_id
      LEFT JOIN medical_records mr ON s.id = mr.student_id
    `;

    const conditions = [];
    const request = pool.request();

    if (userRole === 'nurse') {
      // Nurses can only see students assigned to them
      query += ' JOIN nurse_students ns ON s.id = ns.student_id ';
      conditions.push('ns.nurse_id = (SELECT id FROM nurses WHERE user_id = @user_id) AND ns.is_active = 1');
      request.input('user_id', sql.Int, userId);
    }

    if (department) {
      conditions.push('s.department = @department');
      request.input('department', sql.VarChar, department);
    }

    if (schoolYear) {
      conditions.push('s.school_year = @school_year');
      request.input('school_year', sql.VarChar, schoolYear);
    }

    if (schoolLevel) {
      conditions.push('s.school_level = @school_level');
      request.input('school_level', sql.VarChar, schoolLevel);
    }

    if (semester) {
      conditions.push('s.school_year LIKE @semester');
      request.input('semester', sql.VarChar, `%${semester}%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' GROUP BY s.id, s.student_id, s.name, s.email, s.phone, s.school_year, s.school_level, s.department, s.date_of_birth, s.gender, s.blood_type, s.allergies, s.medical_conditions, s.created_at ';
    query += ' ORDER BY s.name';

    const result = await request.query(query);

    res.json({
      reportType: 'Student Report',
      generatedAt: new Date().toISOString(),
      filters: { department, schoolYear, schoolLevel, semester },
      data: result.recordset
    });
  } catch (error) {
    console.error('Error generating student report:', error);
    res.status(500).json({ message: 'Error generating student report' });
  }
});

// Get report statistics
router.get('/statistics', authorizeRole(['nurse', 'admin']), async (req, res) => {
  try {
    const { period = 'month' } = req.query; // month, quarter, semester, year
    const userId = req.user.id;
    const userRole = req.user.role;

    const pool = await poolPromise;

    let dateCondition = '';
    const request = pool.request();

    if (userRole === 'nurse') {
      request.input('user_id', sql.Int, userId);
    }

    // Calculate date range based on period
    const now = new Date();
    let startDate;

    switch (period) {
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      case 'semester':
        startDate = now.getMonth() < 6 ?
          new Date(now.getFullYear(), 0, 1) :
          new Date(now.getFullYear(), 6, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    request.input('start_date', sql.Date, startDate.toISOString().split('T')[0]);

    // Total appointments
    let appointmentsQuery = `
      SELECT COUNT(*) as total
      FROM appointments a
      WHERE CAST(a.appointment_date AS DATE) >= @start_date
    `;

    if (userRole === 'nurse') {
      appointmentsQuery += ' AND a.nurse_id = (SELECT id FROM nurses WHERE user_id = @user_id)';
    }

    const appointmentsResult = await request.query(appointmentsQuery);

    // Completed appointments
    let completedQuery = `
      SELECT COUNT(*) as total
      FROM appointments a
      WHERE a.status = 'completed' AND CAST(a.appointment_date AS DATE) >= @start_date
    `;

    if (userRole === 'nurse') {
      completedQuery += ' AND a.nurse_id = (SELECT id FROM nurses WHERE user_id = @user_id)';
    }

    const completedResult = await request.query(completedQuery);

    // Total medical records
    let recordsQuery = `
      SELECT COUNT(*) as total
      FROM medical_records mr
      WHERE CAST(mr.visit_date AS DATE) >= @start_date
    `;

    if (userRole === 'nurse') {
      recordsQuery += ' AND mr.nurse_id = (SELECT id FROM nurses WHERE user_id = @user_id)';
    }

    const recordsResult = await request.query(recordsQuery);

    // Total students
    let studentsQuery = 'SELECT COUNT(*) as total FROM students s';

    if (userRole === 'nurse') {
      studentsQuery += ' JOIN nurse_students ns ON s.id = ns.student_id WHERE ns.nurse_id = (SELECT id FROM nurses WHERE user_id = @user_id) AND ns.is_active = 1';
    }

    const studentsResult = await request.query(studentsQuery);

    res.json({
      period,
      startDate: startDate.toISOString().split('T')[0],
      statistics: {
        totalAppointments: appointmentsResult.recordset[0].total,
        completedAppointments: completedResult.recordset[0].total,
        totalMedicalRecords: recordsResult.recordset[0].total,
        totalStudents: studentsResult.recordset[0].total
      }
    });
  } catch (error) {
    console.error('Error fetching report statistics:', error);
    res.status(500).json({ message: 'Error fetching report statistics' });
  }
});

module.exports = router;