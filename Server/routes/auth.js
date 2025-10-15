const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { poolPromise, sql } = require('../db');
const { sendPasswordResetEmail } = require('../utils/mailer');
const { authenticateToken } = require('../middleware/auth');

// Register
router.post('/register', async (req, res) => {
  try {
    const {
      firstName,
      middleName,
      lastName,
      suffix,
      email,
      contactNumber,
      password,
      role,
      idNumber,
      schoolYear,
      schoolLevel,
      department,
      employeeId,
      specialization
    } = req.body;
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

    // Combine name fields for role-specific tables
    const nameParts = [firstName, middleName, lastName, suffix].filter(Boolean);
    const name = nameParts.join(' ').trim();

    // Determine ctu_id based on role
    let ctuId = null;
    if (role === 'student') {
      ctuId = idNumber;
    } else if (role === 'nurse') {
      ctuId = employeeId;
    }

    // Insert user
    const insertUserRequest = pool.request();
    const insertUserResult = await insertUserRequest
      .input('first_name', sql.VarChar, firstName)
      .input('middle_name', sql.VarChar, middleName || null)
      .input('last_name', sql.VarChar, lastName)
      .input('extension_name', sql.VarChar, suffix || null)
      .input('email', sql.VarChar, email)
      .input('contact_number', sql.VarChar, contactNumber)
      .input('password_hash', sql.VarChar, hashedPassword)
      .input('role', sql.VarChar, role)
      .input('ctu_id', sql.VarChar, ctuId)
      .input('school_year', sql.VarChar, role === 'student' ? schoolYear : null)
      .input('school_level', sql.VarChar, role === 'student' ? schoolLevel : null)
      .input('department', sql.VarChar, role === 'student' ? department : null)
      .query('INSERT INTO users (first_name, middle_name, last_name, extension_name, email, contact_number, password_hash, role, ctu_id, school_year, school_level, department) VALUES (@first_name, @middle_name, @last_name, @extension_name, @email, @contact_number, @password_hash, @role, @ctu_id, @school_year, @school_level, @department); SELECT SCOPE_IDENTITY() AS id');

    const userId = insertUserResult.recordset[0].id;

    // Insert role-specific data
    if (role === 'student') {
      const insertStudentRequest = pool.request();
      await insertStudentRequest
        .input('user_id', sql.Int, userId)
        .input('student_id', sql.VarChar, idNumber)
        .input('name', sql.VarChar, name)
        .input('email', sql.VarChar, email)
        .input('phone', sql.VarChar, contactNumber)
        .query('INSERT INTO students (user_id, student_id, name, email, phone) VALUES (@user_id, @student_id, @name, @email, @phone)');
    } else if (role === 'nurse') {
      const insertNurseRequest = pool.request();
      await insertNurseRequest
        .input('user_id', sql.Int, userId)
        .input('name', sql.VarChar, name)
        .input('email', sql.VarChar, email)
        .input('specialization', sql.VarChar, specialization || null)
        .input('license_number', sql.VarChar, employeeId)
        .input('phone', sql.VarChar, contactNumber)
        .query('INSERT INTO nurses (user_id, name, email, specialization, license_number, phone) VALUES (@user_id, @name, @email, @specialization, @license_number, @phone)');
    }

    res.status(201).json({ message: 'User registered successfully', userId });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ message: 'Error registering user' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const pool = await poolPromise;

    const request = pool.request();
    const result = await request
      .input('email', sql.VarChar, email)
      .query('SELECT * FROM users WHERE email = @email');
    if (result.recordset.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.recordset[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Combine name fields for response
    const nameParts = [user.first_name, user.middle_name, user.last_name, user.extension_name].filter(Boolean);
    const fullName = nameParts.join(' ').trim();

    res.json({ token, user: { id: user.id, name: fullName, email: user.email, role: user.role } });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ message: 'Error logging in' });
  }
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const pool = await poolPromise;

    const request = pool.request();
    const result = await request
      .input('email', sql.VarChar, email)
      .query('SELECT id FROM users WHERE email = @email');

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const resetToken = jwt.sign({ email }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '1h' });
    await sendPasswordResetEmail(email, resetToken);

    res.json({ message: 'Password reset email sent' });
  } catch (error) {
    console.error('Error sending reset email:', error);
    res.status(500).json({ message: 'Error sending reset email' });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const pool = await poolPromise;

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const request = pool.request();
    await request
      .input('password_hash', sql.VarChar, hashedPassword)
      .input('email', sql.VarChar, decoded.email)
      .query('UPDATE users SET password_hash = @password_hash WHERE email = @email');

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ message: 'Invalid or expired token' });
  }
});

// Get authenticated user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await poolPromise;

    const request = pool.request();
    const result = await request
      .input('id', sql.Int, userId)
      .query(`
        SELECT
          id,
          first_name,
          middle_name,
          last_name,
          extension_name,
          email,
          contact_number,
          role,
          ctu_id,
          school_year,
          school_level,
          department,
          created_at
        FROM users
        WHERE id = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.recordset[0];

    // Combine name fields
    const nameParts = [user.first_name, user.middle_name, user.last_name, user.extension_name].filter(Boolean);
    const fullName = nameParts.join(' ').trim();

    // Return user profile data
    res.json({
      id: user.id,
      name: fullName,
      firstName: user.first_name,
      middleName: user.middle_name,
      lastName: user.last_name,
      extensionName: user.extension_name,
      email: user.email,
      contactNumber: user.contact_number,
      role: user.role,
      ctuId: user.ctu_id,
      schoolYear: user.school_year,
      schoolLevel: user.school_level,
      department: user.department,
      createdAt: user.created_at
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ message: 'Error fetching profile' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
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

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Error updating profile' });
  }
});

module.exports = router;