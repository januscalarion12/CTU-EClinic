const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER || 'clinic_app',
    password: process.env.DB_PASSWORD || 'Clinic@2026!',
    server: process.env.DB_HOST || 'LAPTOP-CO8MFUK2\\SQLEXPRESS',
    database: process.env.DB_NAME || 'CTU',
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function run() {
    try {
        let pool = await sql.connect(config);
        console.log('--- Appointments Columns ---');
        let appointments = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'appointments'");
        console.log(JSON.stringify(appointments.recordset, null, 2));
        
        console.log('--- Students Columns ---');
        let students = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'students'");
        console.log(JSON.stringify(students.recordset, null, 2));

        console.log('--- Nurse Availability Columns ---');
        let availability = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'nurse_availability'");
        console.log(JSON.stringify(availability.recordset, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
