const sql = require('mssql');
const fs = require('fs');
const path = require('path');
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

async function runMigration() {
    try {
        console.log('Connecting to database...');
        const pool = await sql.connect(config);
        
        console.log('Reading migration script...');
        const scriptPath = path.join(__dirname, 'fix_role_constraint.sql');
        const script = fs.readFileSync(scriptPath, 'utf8');
        
        console.log('Executing migration...');
        await pool.request().query(script);
        
        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:');
        console.error(err);
        process.exit(1);
    }
}

runMigration();
