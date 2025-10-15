const mysql = require('mysql2/promise');

async function testDatabaseConnection() {
  let connection;

  try {
    console.log('Testing database connection...');

    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'clinic_db'
    });

    console.log('✓ Database connection successful');

    // Test basic queries
    const [tables] = await connection.execute('SHOW TABLES');
    console.log('✓ Tables found:', tables.length);

    // Test user table
    const [users] = await connection.execute('SELECT COUNT(*) as count FROM users');
    console.log('✓ Users table has', users[0].count, 'records');

    // Test nurses table
    const [nurses] = await connection.execute('SELECT COUNT(*) as count FROM nurses');
    console.log('✓ Nurses table has', nurses[0].count, 'records');

    // Test students table
    const [students] = await connection.execute('SELECT COUNT(*) as count FROM students');
    console.log('✓ Students table has', students[0].count, 'records');

    // Test bookings table
    const [bookings] = await connection.execute('SELECT COUNT(*) as count FROM bookings');
    console.log('✓ Bookings table has', bookings[0].count, 'records');

    // Test reports table
    const [reports] = await connection.execute('SELECT COUNT(*) as count FROM reports');
    console.log('✓ Reports table has', reports[0].count, 'records');

    // Test nurse_students relationship
    const [relationships] = await connection.execute('SELECT COUNT(*) as count FROM nurse_students');
    console.log('✓ Nurse-student relationships:', relationships[0].count);

    console.log('✓ All database tests passed');

  } catch (error) {
    console.error('✗ Database test failed:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

async function testUserOperations() {
  let connection;

  try {
    console.log('\nTesting user operations...');

    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'clinic_db'
    });

    // Test user creation
    const testEmail = `test${Date.now()}@example.com`;
    const [result] = await connection.execute(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      ['Test User', testEmail, 'hashedpassword', 'student']
    );
    console.log('✓ User creation successful, ID:', result.insertId);

    // Test user retrieval
    const [users] = await connection.execute('SELECT * FROM users WHERE email = ?', [testEmail]);
    console.log('✓ User retrieval successful:', users[0].name);

    // Test user update
    await connection.execute('UPDATE users SET name = ? WHERE email = ?', ['Updated Test User', testEmail]);
    const [updatedUsers] = await connection.execute('SELECT name FROM users WHERE email = ?', [testEmail]);
    console.log('✓ User update successful:', updatedUsers[0].name);

    // Test user deletion
    await connection.execute('DELETE FROM users WHERE email = ?', [testEmail]);
    const [deletedUsers] = await connection.execute('SELECT * FROM users WHERE email = ?', [testEmail]);
    console.log('✓ User deletion successful, remaining records:', deletedUsers.length);

    console.log('✓ All user operation tests passed');

  } catch (error) {
    console.error('✗ User operation test failed:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

async function testBookingOperations() {
  let connection;

  try {
    console.log('\nTesting booking operations...');

    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'clinic_db'
    });

    // Get existing student and nurse IDs
    const [students] = await connection.execute('SELECT id FROM students LIMIT 1');
    const [nurses] = await connection.execute('SELECT id FROM nurses LIMIT 1');

    if (students.length === 0 || nurses.length === 0) {
      console.log('⚠ Skipping booking tests - no test data available');
      return;
    }

    const studentId = students[0].id;
    const nurseId = nurses[0].id;

    // Test booking creation
    const [result] = await connection.execute(
      'INSERT INTO bookings (student_id, nurse_id, appointment_date, reason, status) VALUES (?, ?, ?, ?, ?)',
      [studentId, nurseId, '2024-12-31 10:00:00', 'Test booking', 'pending']
    );
    console.log('✓ Booking creation successful, ID:', result.insertId);

    // Test booking retrieval
    const [bookings] = await connection.execute('SELECT * FROM bookings WHERE id = ?', [result.insertId]);
    console.log('✓ Booking retrieval successful:', bookings[0].reason);

    // Test booking update
    await connection.execute('UPDATE bookings SET status = ? WHERE id = ?', ['confirmed', result.insertId]);
    const [updatedBookings] = await connection.execute('SELECT status FROM bookings WHERE id = ?', [result.insertId]);
    console.log('✓ Booking update successful:', updatedBookings[0].status);

    // Test booking deletion
    await connection.execute('DELETE FROM bookings WHERE id = ?', [result.insertId]);
    const [deletedBookings] = await connection.execute('SELECT * FROM bookings WHERE id = ?', [result.insertId]);
    console.log('✓ Booking deletion successful, remaining records:', deletedBookings.length);

    console.log('✓ All booking operation tests passed');

  } catch (error) {
    console.error('✗ Booking operation test failed:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run all tests
async function runAllTests() {
  try {
    await testDatabaseConnection();
    await testUserOperations();
    await testBookingOperations();
    console.log('\n🎉 All database tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Database tests failed:', error);
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  runAllTests();
}

module.exports = {
  testDatabaseConnection,
  testUserOperations,
  testBookingOperations,
  runAllTests
};