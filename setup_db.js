const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

async function setupDatabase() {
  let connection;

  try {
    // Create connection without database
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true
    });

    console.log('Connected to MySQL server');

    // Create database if it doesn't exist
    await connection.execute('CREATE DATABASE IF NOT EXISTS clinic_db');
    console.log('Database clinic_db created or already exists');

    // Use the database
    await connection.execute('USE clinic_db');

    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');

    await connection.execute(schema);
    console.log('Database schema created successfully');

    // Grant permissions
    const permissionsPath = path.join(__dirname, 'grant_permissions.sql');
    const permissions = await fs.readFile(permissionsPath, 'utf8');

    await connection.execute(permissions);
    console.log('Permissions granted successfully');

    console.log('Database setup completed successfully');

  } catch (error) {
    console.error('Error setting up database:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run setup if called directly
if (require.main === module) {
  setupDatabase()
    .then(() => {
      console.log('Setup completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Setup failed:', error);
      process.exit(1);
    });
}

module.exports = setupDatabase;