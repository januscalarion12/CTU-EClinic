const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER || 'clinic_app',
    password: process.env.DB_PASSWORD || 'Clinic@2026!',
    server: process.env.DB_HOST || 'LAPTOP-CO8MFUK2\\SQLEXPRESS',
    database: process.env.DB_NAME || 'CTU',
    options: {
        encrypt: true,
        trustServerCertificate: true,
        requestTimeout: 120000
    }
};

async function run() {
    try {
        let pool = await sql.connect(config);
        let dbInfo = await pool.request().query("SELECT DB_NAME() as current_db");
        console.log('Connected to:', dbInfo.recordset[0].current_db);

        console.log('--- Tables Info ---');
        let tables = await pool.request().query("SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME IN ('appointments', 'medical_records', 'reports')");
        console.log(JSON.stringify(tables.recordset, null, 2));

        console.log('--- permissions ---');
        let res = await pool.request().query("SELECT permission_name FROM sys.fn_my_permissions(NULL, 'DATABASE')");
        console.log(JSON.stringify(res.recordset, null, 2));
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
