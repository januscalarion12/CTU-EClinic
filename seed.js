const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function seedDatabase() {
  let connection;

  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'LAPTOP-CO8MFUK2\SQLEXPRESS',
      user: process.env.DB_USER || 'ctu_clinic',
      password: process.env.DB_PASSWORD || 'Eclinic2025@',
      database: process.env.DB_NAME || 'CTU_ClinicDB',
      multipleStatements: true
    });

    console.log('Connected to database for seeding');

    // Hash password for default users
    const hashedPassword = await bcrypt.hash('password123', 10);

    // Insert default admin user
    await connection.execute(`
      INSERT IGNORE INTO users (name, email, password, role) VALUES
      ('Admin User', 'admin@clinic.com', ?, 'admin')
    `, [hashedPassword]);

    // Insert sample nurses
    const nurseUsers = [
      ['Nurse Johnson', 'nurse1@clinic.com', hashedPassword, 'nurse'],
      ['Nurse Smith', 'nurse2@clinic.com', hashedPassword, 'nurse'],
      ['Nurse Davis', 'nurse3@clinic.com', hashedPassword, 'nurse']
    ];

    for (const nurse of nurseUsers) {
      await connection.execute(`
        INSERT IGNORE INTO users (name, email, password, role) VALUES (?, ?, ?, ?)
      `, nurse);
    }

    // Get nurse user IDs
    const [nurseRows] = await connection.execute(`
      SELECT id, name FROM users WHERE role = 'nurse'
    `);

    // Insert nurse details
    for (const nurse of nurseRows) {
      await connection.execute(`
        INSERT IGNORE INTO nurses (user_id, name, specialization) VALUES (?, ?, ?)
      `, [nurse.id, nurse.name, 'General Practice']);
    }

    // Insert sample students
    const studentUsers = [
      ['John Doe', 'student1@clinic.com', hashedPassword, 'student'],
      ['Jane Smith', 'student2@clinic.com', hashedPassword, 'student'],
      ['Bob Johnson', 'student3@clinic.com', hashedPassword, 'student'],
      ['Alice Brown', 'student4@clinic.com', hashedPassword, 'student']
    ];

    for (const student of studentUsers) {
      await connection.execute(`
        INSERT IGNORE INTO users (name, email, password, role) VALUES (?, ?, ?, ?)
      `, student);
    }

    // Get student user IDs
    const [studentRows] = await connection.execute(`
      SELECT id, name FROM users WHERE role = 'student'
    `);

    // Insert student details
    for (let i = 0; i < studentRows.length; i++) {
      const student = studentRows[i];
      await connection.execute(`
        INSERT IGNORE INTO students (user_id, name, student_id, phone, address, emergency_contact) VALUES
        (?, ?, ?, ?, ?, ?)
      `, [
        student.id,
        student.name,
        `STU${String(i + 1).padStart(3, '0')}`,
        `+1-555-010${i + 1}`,
        `Address ${i + 1}`,
        `Emergency Contact ${i + 1}`
      ]);
    }

    // Assign students to nurses
    const [nurseIds] = await connection.execute('SELECT id FROM nurses LIMIT 3');
    const [studentIds] = await connection.execute('SELECT id FROM students LIMIT 4');

    for (let i = 0; i < studentIds.length; i++) {
      const nurseId = nurseIds[i % nurseIds.length].id;
      const studentId = studentIds[i].id;
      await connection.execute(`
        INSERT IGNORE INTO nurse_students (nurse_id, student_id) VALUES (?, ?)
      `, [nurseId, studentId]);
    }

    // Insert sample bookings
    const sampleBookings = [
      [studentIds[0].id, nurseIds[0].id, '2024-01-15 10:00:00', 'Regular checkup', 'completed'],
      [studentIds[1].id, nurseIds[1].id, '2024-01-16 14:00:00', 'Vaccination', 'confirmed'],
      [studentIds[2].id, nurseIds[2].id, '2024-01-17 09:00:00', 'Health screening', 'pending']
    ];

    for (const booking of sampleBookings) {
      await connection.execute(`
        INSERT IGNORE INTO bookings (student_id, nurse_id, appointment_date, reason, status) VALUES (?, ?, ?, ?, ?)
      `, booking);
    }

    // Insert sample reports
    const sampleReports = [
      [studentIds[0].id, nurseIds[0].id, 'Health Check', 'Student is in good health. All vitals normal.'],
      [studentIds[1].id, nurseIds[1].id, 'Vaccination Report', 'Flu vaccination administered successfully.'],
      [studentIds[2].id, nurseIds[2].id, 'Screening Results', 'Blood pressure and BMI within normal range.']
    ];

    for (const report of sampleReports) {
      await connection.execute(`
        INSERT IGNORE INTO reports (student_id, nurse_id, report_type, description) VALUES (?, ?, ?, ?)
      `, report);
    }

    console.log('Database seeded successfully');

  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run seed if called directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('Seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}

module.exports = seedDatabase;