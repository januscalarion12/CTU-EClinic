const express = require('express');
const router = express.Router();
const { poolPromise, sql } = require('../db');
const { authorizeRole } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

// Get dashboard statistics
router.get('/dashboard-stats', authorizeRole(['admin']), async (req, res) => {
  try {
    const pool = await poolPromise;

    // Get total users count
    const totalUsersResult = await pool.request().query('SELECT COUNT(*) as total FROM users');
    
    // Get total nurses count
    const totalNursesResult = await pool.request().query("SELECT COUNT(*) as total FROM users WHERE role = 'nurse'");
    
    // Get total students count
    const totalStudentsResult = await pool.request().query("SELECT COUNT(*) as total FROM users WHERE role = 'student'");
    
    // Get total appointments count (current month)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const totalAppointmentsResult = await pool.request()
      .input('startOfMonth', sql.DateTime, startOfMonth)
      .query("SELECT COUNT(*) as total FROM appointments WHERE created_at >= @startOfMonth AND (notes IS NULL OR CAST(notes AS NVARCHAR(MAX)) NOT LIKE '[[]ARCHIVED]%') AND status != 'archived'");

    res.json({
      totalUsers: totalUsersResult.recordset[0].total,
      totalNurses: totalNursesResult.recordset[0].total,
      totalStudents: totalStudentsResult.recordset[0].total,
      totalAppointments: totalAppointmentsResult.recordset[0].total
    });
  } catch (error) {
    console.error('Error fetching dashboard statistics:', error);
    res.status(500).json({ message: 'Error fetching dashboard statistics' });
  }
});

// Get all users
router.get('/users', authorizeRole(['admin']), async (req, res) => {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;
    const pool = await poolPromise;

    let query = `
      SELECT
        u.id,
        u.first_name,
        u.middle_name,
        u.last_name,
        u.extension_name,
        u.email,
        u.contact_number,
        u.role,
        u.ctu_id,
        u.school_year,
        u.school_level,
        u.department,
        u.is_email_confirmed,
        u.created_at,
        CASE
          WHEN u.role = 'student' THEN s.student_id
          WHEN u.role = 'nurse' THEN n.license_number
          ELSE NULL
        END as role_specific_id
      FROM users u
      LEFT JOIN students s ON u.id = s.user_id AND u.role = 'student'
      LEFT JOIN nurses n ON u.id = n.user_id AND u.role = 'nurse'
    `;

    const conditions = [];
    const request = pool.request();

    if (role) {
      conditions.push('u.role = @role');
      request.input('role', sql.VarChar, role);
    }

    if (search) {
      conditions.push('(u.first_name LIKE @search OR u.last_name LIKE @search OR u.email LIKE @search OR u.ctu_id LIKE @search)');
      request.input('search', sql.VarChar, `%${search}%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY u.created_at DESC';

    // Add pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY`;

    const result = await request.query(query);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM users u';
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }
    const countResult = await request.query(countQuery);

    res.json({
      users: result.recordset,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.recordset[0].total,
        pages: Math.ceil(countResult.recordset[0].total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// Create user
router.post('/users', authorizeRole(['admin']), async (req, res) => {
  try {
    const {
      firstName,
      middleName,
      lastName,
      suffix,
      extensionName,
      email,
      contactNumber,
      password,
      role,
      idNumber,
      schoolYear,
      schoolLevel,
      department,
      employeeId,
      specialization,
      isEmailConfirmed = false
    } = req.body;

    // Handle boolean conversion from string (form data)
    const confirmed = isEmailConfirmed === '1' || isEmailConfirmed === 1 || isEmailConfirmed === true;

    const pool = await poolPromise;

    // Check if user exists
    const existingRequest = pool.request();
    const existingResult = await existingRequest
      .input('email', sql.VarChar, email)
      .query('SELECT id FROM users WHERE email = @email');
    if (existingResult.recordset.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Determine ctu_id based on role and ensure it's null if empty
    let ctuId = null;
    if (role === 'student') {
      ctuId = idNumber || null;
    } else if (role === 'nurse') {
      ctuId = employeeId || null;
    } else if (role === 'admin') {
      ctuId = idNumber || employeeId || null;
    }

    // Insert user
    const insertUserRequest = pool.request();
    const insertUserResult = await insertUserRequest
      .input('first_name', sql.VarChar, firstName)
      .input('middle_name', sql.VarChar, middleName || null)
      .input('last_name', sql.VarChar, lastName)
      .input('extension_name', sql.VarChar, suffix || extensionName || null)
      .input('email', sql.VarChar, email)
      .input('contact_number', sql.VarChar, contactNumber || null)
      .input('password_hash', sql.VarChar, hashedPassword)
      .input('role', sql.VarChar, role)
      .input('ctu_id', sql.VarChar, ctuId)
      .input('school_year', sql.VarChar, role === 'student' ? (schoolYear || null) : null)
      .input('school_level', sql.VarChar, role === 'student' ? (schoolLevel || null) : null)
      .input('department', sql.VarChar, department || null)
      .input('is_email_confirmed', sql.Bit, confirmed)
      .query('INSERT INTO users (first_name, middle_name, last_name, extension_name, email, contact_number, password_hash, role, ctu_id, school_year, school_level, department, is_email_confirmed) VALUES (@first_name, @middle_name, @last_name, @extension_name, @email, @contact_number, @password_hash, @role, @ctu_id, @school_year, @school_level, @department, @is_email_confirmed); SELECT SCOPE_IDENTITY() AS id');

    const userId = insertUserResult.recordset[0].id;

    // Insert role-specific data
    if (role === 'student') {
      const insertStudentRequest = pool.request();
      await insertStudentRequest
        .input('user_id', sql.Int, userId)
        .input('student_id', sql.VarChar, idNumber)
        .input('name', sql.VarChar, `${firstName} ${middleName || ''} ${lastName} ${suffix || ''}`.trim())
        .input('email', sql.VarChar, email)
        .input('phone', sql.VarChar, contactNumber)
        .query('INSERT INTO students (user_id, student_id, name, email, phone) VALUES (@user_id, @student_id, @name, @email, @phone)');
    } else if (role === 'nurse') {
      const insertNurseRequest = pool.request();
      await insertNurseRequest
        .input('user_id', sql.Int, userId)
        .input('name', sql.VarChar, `${firstName} ${middleName || ''} ${lastName} ${suffix || ''}`.trim())
        .input('email', sql.VarChar, email)
        .input('specialization', sql.VarChar, specialization || null)
        .input('license_number', sql.VarChar, employeeId)
        .input('phone', sql.VarChar, contactNumber)
        .query('INSERT INTO nurses (user_id, name, email, specialization, license_number, phone) VALUES (@user_id, @name, @email, @specialization, @license_number, @phone)');
    }

    res.status(201).json({ message: 'User created successfully', userId });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Error creating user' });
  }
});

// Update user
router.put('/users/:id', authorizeRole(['admin']), async (req, res) => {
  try {
    const userId = req.params.id;
    const updates = req.body;
    
    const pool = await poolPromise;
    
    // First, get current user data to handle partial updates
    const currentRequest = pool.request();
    const currentResult = await currentRequest
      .input('id', sql.Int, userId)
      .query('SELECT * FROM users WHERE id = @id');
    
    if (currentResult.recordset.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const currentUser = currentResult.recordset[0];
    
    // Merge updates with current data
    const firstName = updates.firstName !== undefined ? updates.firstName : currentUser.first_name;
    const middleName = updates.middle_name !== undefined ? updates.middle_name : (updates.middleName !== undefined ? updates.middleName : currentUser.middle_name);
    const lastName = updates.lastName !== undefined ? updates.lastName : currentUser.last_name;
    const extensionName = updates.extension_name !== undefined ? updates.extension_name : (updates.extensionName !== undefined ? updates.extensionName : currentUser.extension_name);
    const email = updates.email !== undefined ? updates.email : currentUser.email;
    const contactNumber = updates.contactNumber !== undefined ? updates.contactNumber : currentUser.contact_number;
    const role = updates.role !== undefined ? updates.role : currentUser.role;
    const schoolYear = updates.schoolYear !== undefined ? updates.schoolYear : currentUser.school_year;
    const schoolLevel = updates.schoolLevel !== undefined ? updates.schoolLevel : currentUser.school_level;
    const department = updates.department !== undefined ? updates.department : currentUser.department;
    
    let confirmed = currentUser.is_email_confirmed;
    if (updates.isEmailConfirmed !== undefined) {
      confirmed = updates.isEmailConfirmed === '1' || updates.isEmailConfirmed === 1 || updates.isEmailConfirmed === true;
    }

    // Update users table
    const updateUserRequest = pool.request();
    await updateUserRequest
      .input('first_name', sql.VarChar, firstName)
      .input('middle_name', sql.VarChar, middleName || null)
      .input('last_name', sql.VarChar, lastName)
      .input('extension_name', sql.VarChar, extensionName || null)
      .input('email', sql.VarChar, email)
      .input('contact_number', sql.VarChar, contactNumber || null)
      .input('role', sql.VarChar, role)
      .input('school_year', sql.VarChar, role === 'student' ? (schoolYear || null) : null)
      .input('school_level', sql.VarChar, role === 'student' ? (schoolLevel || null) : null)
      .input('department', sql.VarChar, department || null)
      .input('is_email_confirmed', sql.Bit, confirmed)
      .input('id', sql.Int, userId)
      .query(`
        UPDATE users
        SET first_name = @first_name,
            middle_name = @middle_name,
            last_name = @last_name,
            extension_name = @extension_name,
            email = @email,
            contact_number = @contact_number,
            role = @role,
            school_year = @school_year,
            school_level = @school_level,
            department = @department,
            is_email_confirmed = @is_email_confirmed
        WHERE id = @id
      `);

    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Error updating user' });
  }
});

// Get user by ID
router.get('/users/:id', authorizeRole(['admin']), async (req, res) => {
  try {
    const userId = req.params.id;
    const pool = await poolPromise;

    const result = await pool.request()
      .input('id', sql.Int, userId)
      .query(`
        SELECT
          u.id,
          u.first_name,
          u.middle_name,
          u.last_name,
          u.extension_name,
          u.email,
          u.contact_number,
          u.role,
          u.ctu_id,
          u.school_year,
          u.school_level,
          u.department,
          u.is_email_confirmed,
          u.created_at,
          CASE
            WHEN u.role = 'student' THEN s.student_id
            WHEN u.role = 'nurse' THEN n.license_number
            ELSE NULL
          END as role_specific_id,
          CASE
            WHEN u.role = 'nurse' THEN n.specialization
            ELSE NULL
          END as specialization
        FROM users u
        LEFT JOIN students s ON u.id = s.user_id AND u.role = 'student'
        LEFT JOIN nurses n ON u.id = n.user_id AND u.role = 'nurse'
        WHERE u.id = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ message: 'Error fetching user details' });
  }
});

// Delete user
router.delete('/users/:id', authorizeRole(['admin']), async (req, res) => {
  try {
    const userId = req.params.id;
    const pool = await poolPromise;

    // Check if user has active appointments
    const checkAppointmentsRequest = pool.request();
    const appointmentsCheck = await checkAppointmentsRequest
      .input('user_id', sql.Int, userId)
      .query(`
        SELECT COUNT(*) as count
        FROM appointments
        WHERE (
          student_id IN (SELECT id FROM students WHERE user_id = @user_id) 
          OR 
          nurse_id IN (SELECT id FROM nurses WHERE user_id = @user_id)
        )
        AND status IN ('pending', 'confirmed')
      `);

    if (appointmentsCheck.recordset[0].count > 0) {
      return res.status(409).json({ message: 'Cannot delete user with active appointments' });
    }

    // Start a transaction for safe deletion
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. Get user role to know which related tables to clean
      const userResult = await transaction.request()
        .input('id', sql.Int, userId)
        .query('SELECT role FROM users WHERE id = @id');
      
      if (userResult.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ message: 'User not found' });
      }

      const role = userResult.recordset[0].role;

      // 2. Delete role-specific data first
      if (role === 'student') {
        const studentIdQuery = '(SELECT id FROM students WHERE user_id = @user_id)';
        
        await transaction.request()
          .input('user_id', sql.Int, userId)
          .query(`DELETE FROM nurse_students WHERE student_id IN ${studentIdQuery}`);

        await transaction.request()
          .input('user_id', sql.Int, userId)
          .query(`DELETE FROM appointment_waiting_list WHERE student_id IN ${studentIdQuery}`);

        await transaction.request()
          .input('user_id', sql.Int, userId)
          .query(`DELETE FROM reports WHERE student_id IN ${studentIdQuery}`);

        await transaction.request()
          .input('user_id', sql.Int, userId)
          .query('DELETE FROM students WHERE user_id = @user_id');
      } else if (role === 'nurse') {
        // For nurses, handle all dependent tables with NO ACTION constraints
        const nurseIdQuery = '(SELECT id FROM nurses WHERE user_id = @user_id)';
        
        await transaction.request()
          .input('user_id', sql.Int, userId)
          .query(`DELETE FROM nurse_students WHERE nurse_id IN ${nurseIdQuery}`);

        await transaction.request()
          .input('user_id', sql.Int, userId)
          .query(`DELETE FROM nurse_availability WHERE nurse_id IN ${nurseIdQuery}`);
        
        await transaction.request()
          .input('user_id', sql.Int, userId)
          .query(`DELETE FROM appointment_waiting_list WHERE nurse_id IN ${nurseIdQuery}`);

        await transaction.request()
          .input('user_id', sql.Int, userId)
          .query(`DELETE FROM medical_records WHERE nurse_id IN ${nurseIdQuery}`);

        await transaction.request()
          .input('user_id', sql.Int, userId)
          .query(`DELETE FROM reports WHERE nurse_id IN ${nurseIdQuery}`);

        await transaction.request()
          .input('user_id', sql.Int, userId)
          .query(`DELETE FROM appointments WHERE nurse_id IN ${nurseIdQuery}`);
        
        await transaction.request()
          .input('user_id', sql.Int, userId)
          .query('DELETE FROM nurses WHERE user_id = @user_id');
      }

      // 3. Delete from general user-related tables
      await transaction.request()
        .input('user_id', sql.Int, userId)
        .query('DELETE FROM notifications WHERE user_id = @user_id');

      // 4. Finally delete from users table
      await transaction.request()
        .input('id', sql.Int, userId)
        .query('DELETE FROM users WHERE id = @id');

      await transaction.commit();
      res.json({ message: 'User and all related records deleted successfully' });
    } catch (err) {
      console.error('Transaction error during user deletion:', err);
      await transaction.rollback();
      
      // Handle foreign key constraint errors specifically (SQL Error 547)
      if (err.number === 547 || err.code === 'EREQUEST' && err.message.includes('REFERENCE constraint')) {
        return res.status(409).json({ 
          message: 'Cannot delete user because they have associated records (appointments, medical history, etc.). Consider deactivating them instead.' 
        });
      }
      
      throw err; // Re-throw to be caught by outer try-catch
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Error deleting user' });
  }
});

// Get system statistics
router.get('/statistics', authorizeRole(['admin']), async (req, res) => {
  try {
    const pool = await poolPromise;

    // Get user counts by role
    const userStatsRequest = pool.request();
    const userStats = await userStatsRequest.query(`
      SELECT role, COUNT(*) as count
      FROM users
      GROUP BY role
    `);

    // Get pending users count (unconfirmed emails)
    const pendingUsersRequest = pool.request();
    const pendingUsersResult = await pendingUsersRequest.query(`
      SELECT COUNT(*) as count
      FROM users
      WHERE is_email_confirmed = 0
    `);

    // Get appointment statistics
    const appointmentStatsRequest = pool.request();
    const appointmentStats = await appointmentStatsRequest.query(`
      SELECT status, COUNT(*) as count
      FROM appointments
      WHERE (notes IS NULL OR CAST(notes AS NVARCHAR(MAX)) NOT LIKE '[[]ARCHIVED]%') AND status != 'archived'
      GROUP BY status
    `);

    // Get recent activity (last 30 days)
    const recentActivityRequest = pool.request();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentActivity = await recentActivityRequest
      .input('thirty_days_ago', sql.DateTime2, thirtyDaysAgo)
      .query(`
        SELECT
          COUNT(DISTINCT CASE WHEN role = 'student' THEN id END) as new_students,
          COUNT(DISTINCT CASE WHEN role = 'nurse' THEN id END) as new_nurses,
          (SELECT COUNT(*) FROM appointments WHERE created_at >= @thirty_days_ago AND (notes IS NULL OR CAST(notes AS NVARCHAR(MAX)) NOT LIKE '[[]ARCHIVED]%') AND status != 'archived') as new_appointments,
          (SELECT COUNT(*) FROM medical_records WHERE created_at >= @thirty_days_ago AND (notes IS NULL OR CAST(notes AS NVARCHAR(MAX)) NOT LIKE '[[]ARCHIVED]%') AND record_type NOT LIKE '%_archived') as new_records
        FROM users
        WHERE created_at >= @thirty_days_ago
      `);

    res.json({
      userStats: userStats.recordset,
      pendingUsers: pendingUsersResult.recordset[0].count,
      appointmentStats: appointmentStats.recordset,
      recentActivity: recentActivity.recordset[0]
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ message: 'Error fetching statistics' });
  }
});

// Get audit log
router.get('/audit-log', authorizeRole(['admin']), async (req, res) => {
  try {
    const { page = 1, limit = 50, action, tableName, userId } = req.query;
    const pool = await poolPromise;

    let query = `
      SELECT
        al.*,
        u.first_name,
        u.last_name,
        u.email
      FROM audit_log al
      LEFT JOIN users u ON al.user_id = u.id
    `;

    const conditions = [];
    const request = pool.request();

    if (action) {
      conditions.push('al.action = @action');
      request.input('action', sql.VarChar, action);
    }

    if (tableName) {
      conditions.push('al.table_name = @table_name');
      request.input('table_name', sql.VarChar, tableName);
    }

    if (userId) {
      conditions.push('al.user_id = @user_id');
      request.input('user_id', sql.Int, userId);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY al.created_at DESC';

    // Add pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY`;

    const result = await request.query(query);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM audit_log al';
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }
    const countResult = await request.query(countQuery);

    res.json({
      auditLog: result.recordset,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.recordset[0].total,
        pages: Math.ceil(countResult.recordset[0].total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching audit log:', error);
    res.status(500).json({ message: 'Error fetching audit log' });
  }
});

// Archive old data manually
router.post('/archive', authorizeRole(['admin']), async (req, res) => {
  try {
    const { olderThanMonths = 12 } = req.body;
    const pool = await poolPromise;

    const archiveDate = new Date();
    archiveDate.setMonth(archiveDate.getMonth() - olderThanMonths);

    // Archive old appointments
    const archiveAppointmentsRequest = pool.request();
    const appointmentsArchived = await archiveAppointmentsRequest
      .input('archive_date', sql.DateTime2, archiveDate)
      .query(`
        UPDATE appointments
        SET status = 'archived'
        WHERE status IN ('completed', 'cancelled', 'no_show')
          AND updated_at < @archive_date
      `);

    // Archive old medical records
    const archiveRecordsRequest = pool.request();
    const recordsArchived = await archiveRecordsRequest
      .input('archive_date', sql.DateTime2, archiveDate)
      .query(`
        UPDATE medical_records
        SET record_type = CONCAT(record_type, '_archived')
        WHERE updated_at < @archive_date
      `);

    // Clean up old notifications
    const cleanNotificationsRequest = pool.request();
    const notificationsCleaned = await cleanNotificationsRequest
      .input('archive_date', sql.DateTime2, archiveDate)
      .query(`
        DELETE FROM notifications
        WHERE created_at < @archive_date
      `);

    res.json({
      message: 'Data archived successfully',
      archived: {
        appointments: appointmentsArchived.rowsAffected[0],
        medicalRecords: recordsArchived.rowsAffected[0],
        notifications: notificationsCleaned.rowsAffected[0]
      }
    });
  } catch (error) {
    console.error('Error archiving data:', error);
    res.status(500).json({ message: 'Error archiving data' });
  }
});

// Update admin profile
router.put('/profile', authorizeRole(['admin']), async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      firstName,
      middleName,
      lastName,
      suffix,
      email,
      phone,
      department
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
            department = @department
        WHERE id = @id
      `);

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating admin profile:', error);
    res.status(500).json({ message: 'Error updating admin profile' });
  }
});

// Get system settings
router.get('/settings', authorizeRole(['admin']), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM system_settings');
    
    const settings = {};
    result.recordset.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ message: 'Error fetching settings' });
  }
});

// Update system settings
router.post('/settings', authorizeRole(['admin']), async (req, res) => {
  try {
    const settings = req.body;
    const pool = await poolPromise;
    
    for (const key in settings) {
      await pool.request()
        .input('key', sql.NVarChar, key)
        .input('value', sql.NVarChar, String(settings[key]))
        .query(`
          IF EXISTS (SELECT 1 FROM system_settings WHERE setting_key = @key)
          BEGIN
            UPDATE system_settings SET setting_value = @value, updated_at = GETDATE() WHERE setting_key = @key
          END
          ELSE
          BEGIN
            INSERT INTO system_settings (setting_key, setting_value) VALUES (@key, @value)
          END
        `);
    }
    
    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ message: 'Error updating settings' });
  }
});

// Get system health status
router.get('/health', authorizeRole(['admin']), async (req, res) => {
  try {
    const pool = await poolPromise;
    
    // Check database connection
    const dbCheck = await pool.request().query('SELECT 1 as connected');
    const isDbConnected = dbCheck.recordset[0].connected === 1;

    // Simulate other health metrics for now
    res.json({
      database: isDbConnected ? 'Connected' : 'Disconnected',
      serverLoad: 'Normal',
      storage: 'Available',
      backup: 'Current'
    });
  } catch (error) {
    console.error('Error fetching system health:', error);
    res.status(500).json({ message: 'Error fetching system health' });
  }
});

module.exports = router;