const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { poolPromise, sql } = require('../db');
const { sendPasswordResetEmail, sendEmailConfirmation } = require('../utils/mailer');
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

    // Check for duplicate CTU ID
    let ctuId = null;
    if (role === 'student') {
      ctuId = idNumber;
      const ctuIdCheck = pool.request();
      const ctuIdResult = await ctuIdCheck
        .input('ctu_id', sql.VarChar, ctuId)
        .query('SELECT id FROM users WHERE ctu_id = @ctu_id');
      if (ctuIdResult.recordset.length > 0) {
        return res.status(400).json({ message: 'CTU ID already exists' });
      }
    } else if (role === 'nurse') {
      ctuId = employeeId;
      const ctuIdCheck = pool.request();
      const ctuIdResult = await ctuIdCheck
        .input('ctu_id', sql.VarChar, ctuId)
        .query('SELECT id FROM users WHERE ctu_id = @ctu_id');
      if (ctuIdResult.recordset.length > 0) {
        return res.status(400).json({ message: 'Employee ID already exists' });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate email verification code (6-digit)
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Combine name fields for role-specific tables
    const nameParts = [firstName, middleName, lastName, suffix].filter(Boolean);
    const name = nameParts.join(' ').trim();

    // Insert user (not active yet)
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
      .input('verification_code', sql.NVarChar, verificationCode)
      .input('verification_expires', sql.DateTime2, verificationExpires)
      .query('INSERT INTO users (first_name, middle_name, last_name, extension_name, email, contact_number, password_hash, role, ctu_id, school_year, school_level, department, is_email_confirmed, verification_code, verification_expires) VALUES (@first_name, @middle_name, @last_name, @extension_name, @email, @contact_number, @password_hash, @role, @ctu_id, @school_year, @school_level, @department, 0, @verification_code, @verification_expires); SELECT SCOPE_IDENTITY() AS id');

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

    // Send email confirmation
    try {
      await sendEmailConfirmation(email, verificationCode);
    } catch (emailError) {
      console.error('Error sending confirmation email:', emailError);
      // Don't fail registration if email fails, but log it
    }

    res.status(201).json({
      message: 'Registration successful. Please check your email for the verification code to activate your account.',
      redirectTo: '/verify-email.html',
      email: email
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ message: 'Error registering user' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    const pool = await poolPromise;

    const request = pool.request();
    const result = await request
      .input('email', sql.VarChar, email.trim().toLowerCase())
      .query('SELECT * FROM users WHERE LOWER(email) = @email');

    if (result.recordset.length === 0) {
      // Log failed login attempt - user not found (optional)
      try {
        const auditRequest = pool.request();
        await auditRequest
          .input('action', sql.NVarChar, 'FAILED_LOGIN_USER_NOT_FOUND')
          .input('table_name', sql.NVarChar, 'users')
          .input('old_values', sql.NVarChar, JSON.stringify({ email: email }))
          .input('ip_address', sql.NVarChar, clientIP)
          .input('user_agent', sql.NVarChar, userAgent)
          .query(`
            INSERT INTO audit_log (action, table_name, old_values, ip_address, user_agent)
            VALUES (@action, @table_name, @old_values, @ip_address, @user_agent)
          `);
      } catch (auditError) {
        // Ignore audit logging errors
        console.log('Audit logging failed (table may not exist):', auditError.message);
      }

      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.recordset[0];
    console.log('Login attempt for user:', { email: user.email, id: user.id, is_email_confirmed: user.is_email_confirmed });

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      // Log failed login attempt - invalid password (optional)
      try {
        const auditRequest = pool.request();
        await auditRequest
          .input('user_id', sql.Int, user.id)
          .input('action', sql.NVarChar, 'FAILED_LOGIN_INVALID_PASSWORD')
          .input('table_name', sql.NVarChar, 'users')
          .input('record_id', sql.Int, user.id)
          .input('ip_address', sql.NVarChar, clientIP)
          .input('user_agent', sql.NVarChar, userAgent)
          .query(`
            INSERT INTO audit_log (user_id, action, table_name, record_id, ip_address, user_agent)
            VALUES (@user_id, @action, @table_name, @record_id, @ip_address, @user_agent)
          `);
      } catch (auditError) {
        // Ignore audit logging errors
        console.log('Audit logging failed (table may not exist):', auditError.message);
      }

      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Log successful login (optional)
    try {
      const auditRequest = pool.request();
      await auditRequest
        .input('user_id', sql.Int, user.id)
        .input('action', sql.NVarChar, 'SUCCESSFUL_LOGIN')
        .input('table_name', sql.NVarChar, 'users')
        .input('record_id', sql.Int, user.id)
        .input('ip_address', sql.NVarChar, clientIP)
        .input('user_agent', sql.NVarChar, userAgent)
        .query(`
          INSERT INTO audit_log (user_id, action, table_name, record_id, ip_address, user_agent)
          VALUES (@user_id, @action, @table_name, @record_id, @ip_address, @user_agent)
        `);
    } catch (auditError) {
      // Ignore audit logging errors
      console.log('Audit logging failed (table may not exist):', auditError.message);
    }

    // Create session user object
    const sessionUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.first_name,
      middleName: user.middle_name,
      lastName: user.last_name,
      extensionName: user.extension_name,
      contactNumber: user.contact_number,
      ctuId: user.ctu_id,
      schoolYear: user.school_year,
      schoolLevel: user.school_level,
      department: user.department
    };

    // Store user in session
    req.session.user = sessionUser;

    // Combine name fields for response
    const nameParts = [user.first_name, user.middle_name, user.last_name, user.extension_name].filter(Boolean);
    const fullName = nameParts.join(' ').trim();

    res.json({ user: { id: user.id, name: fullName, email: user.email, role: user.role } });
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

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).json({ message: 'Error logging out' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

// Verify email with code
router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;
    console.log('Verify email attempt:', { email, code });

    if (!email || !code) {
      return res.status(400).json({ message: 'Email and verification code are required' });
    }

    const pool = await poolPromise;
    const request = pool.request();
    const result = await request
      .input('email', sql.VarChar, email.trim().toLowerCase())
      .input('code', sql.NVarChar, code.trim())
      .query('SELECT id, verification_expires, is_email_confirmed, verification_code FROM users WHERE LOWER(email) = @email AND verification_code = @code AND is_email_confirmed = 0');

    console.log('Verification query result:', result.recordset);
    console.log('Input email:', email, 'Input code:', code);

    if (result.recordset.length === 0) {
      console.log('No matching record found for verification');
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    const user = result.recordset[0];
    console.log('User found:', { id: user.id, is_email_confirmed: user.is_email_confirmed, verification_expires: user.verification_expires });

    // Check if code has expired
    if (new Date() > new Date(user.verification_expires)) {
      console.log('Verification code expired');
      return res.status(400).json({ message: 'Verification code has expired' });
    }

    // Confirm email and clear verification data
    const updateRequest = pool.request();
    const updateResult = await updateRequest
      .input('email', sql.VarChar, email.trim().toLowerCase())
      .query('UPDATE users SET is_email_confirmed = 1, verification_code = NULL, verification_expires = NULL WHERE LOWER(email) = @email');

    console.log('Update result rows affected:', updateResult.rowsAffected);

    // Verify the update
    const verifyRequest = pool.request();
    const verifyResult = await verifyRequest
      .input('email', sql.VarChar, email.trim().toLowerCase())
      .query('SELECT is_email_confirmed FROM users WHERE LOWER(email) = @email');
    console.log('Post-verification check:', verifyResult.recordset);

    res.json({ message: 'Email verified successfully. You can now log in to your account.' });
  } catch (error) {
    console.error('Error verifying email:', error);
    res.status(500).json({ message: 'Error verifying email' });
  }
});

// Resend email verification code
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const pool = await poolPromise;
    const request = pool.request();
    const result = await request
      .input('email', sql.VarChar, email)
      .query('SELECT id, is_email_confirmed FROM users WHERE email = @email');

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.recordset[0];

    if (user.is_email_confirmed === 1) {
      return res.status(400).json({ message: 'Email is already verified' });
    }

    // Generate new verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Update user with new code
    const updateRequest = pool.request();
    await updateRequest
      .input('email', sql.VarChar, email)
      .input('verification_code', sql.NVarChar, verificationCode)
      .input('verification_expires', sql.DateTime2, verificationExpires)
      .query('UPDATE users SET verification_code = @verification_code, verification_expires = @verification_expires WHERE email = @email');

    // Send email confirmation
    try {
      await sendEmailConfirmation(email, verificationCode);
    } catch (emailError) {
      console.error('Error sending verification email:', emailError);
      return res.status(500).json({ message: 'Error sending verification email' });
    }

    res.json({ message: 'Verification code sent successfully' });
  } catch (error) {
    console.error('Error resending verification:', error);
    res.status(500).json({ message: 'Error resending verification' });
  }
});

// Change password for authenticated users
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters long' });
    }

    const pool = await poolPromise;

    // Get current password hash
    const getPasswordRequest = pool.request();
    const passwordResult = await getPasswordRequest
      .input('id', sql.Int, userId)
      .query('SELECT password_hash FROM users WHERE id = @id');

    if (passwordResult.recordset.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentHash = passwordResult.recordset[0].password_hash;
    const validPassword = await bcrypt.compare(currentPassword, currentHash);

    if (!validPassword) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const newHashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    const updateRequest = pool.request();
    await updateRequest
      .input('password_hash', sql.VarChar, newHashedPassword)
      .input('id', sql.Int, userId)
      .query('UPDATE users SET password_hash = @password_hash WHERE id = @id');

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: 'Error changing password' });
  }
});

// Check session status
router.get('/session', (req, res) => {
  if (req.session && req.session.user) {
    const user = req.session.user;
    const nameParts = [user.firstName, user.middleName, user.lastName, user.extensionName].filter(Boolean);
    const fullName = nameParts.join(' ').trim();

    res.json({
      authenticated: true,
      user: {
        id: user.id,
        name: fullName,
        email: user.email,
        role: user.role
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

module.exports = router;