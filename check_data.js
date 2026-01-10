const { poolPromise, sql } = require('./Server/db');

async function checkData() {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT TOP 10 
                   mr.id as record_id, 
                   s.id as internal_id, 
                   s.student_id as student_number,
                   s.name as student_table_name,
                   u.first_name, 
                   u.last_name,
                   u.id as user_id,
                   u.role
            FROM medical_records mr
            JOIN students s ON mr.student_id = s.id
            LEFT JOIN users u ON s.user_id = u.id
            ORDER BY mr.created_at DESC
        `);
        console.log('Sample Records:');
        console.table(result.recordset);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkData();
