const { poolPromise, sql } = require('./Server/db');

async function analyzeFK() {
    try {
        const pool = await poolPromise;
        console.log('--- Analyzing Foreign Key Blockers ---');

        // 1. Find all foreign keys referencing users, students, or nurses
        const fkQuery = `
            SELECT 
                tp.name AS table_name,
                cp.name AS column_name,
                tr.name AS referenced_table_name,
                cr.name AS referenced_column_name,
                fk.delete_referential_action_desc
            FROM sys.foreign_keys AS fk
            INNER JOIN sys.foreign_key_columns AS fkc ON fk.object_id = fkc.constraint_object_id
            INNER JOIN sys.tables AS tp ON fkc.parent_object_id = tp.object_id
            INNER JOIN sys.columns AS cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
            INNER JOIN sys.tables AS tr ON fkc.referenced_object_id = tr.object_id
            INNER JOIN sys.columns AS cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id
            WHERE tr.name IN ('users', 'students', 'nurses')
            ORDER BY tr.name, tp.name;
        `;
        const fks = await pool.request().query(fkQuery);
        console.log('Tables referencing core entities:');
        console.table(fks.recordset);

        // 2. Check for "NO_ACTION" or "SET_NULL" that might block if not handled in code
        const noActionFks = fks.recordset.filter(f => f.delete_referential_action_desc === 'NO_ACTION');
        console.log('\nPotential blockers (DELETE NO ACTION):');
        console.table(noActionFks);

        // 3. Check for specific problematic data: Users with multiple student/nurse profiles
        console.log('\nChecking for data inconsistencies...');
        
        const multiStudent = await pool.request().query(`
            SELECT user_id, COUNT(*) as count 
            FROM students 
            GROUP BY user_id 
            HAVING COUNT(*) > 1
        `);
        if (multiStudent.recordset.length > 0) {
            console.log('Users with multiple student profiles (Problematic!):');
            console.table(multiStudent.recordset);
        } else {
            console.log('All users have 0 or 1 student profile.');
        }

        const multiNurse = await pool.request().query(`
            SELECT user_id, COUNT(*) as count 
            FROM nurses 
            GROUP BY user_id 
            HAVING COUNT(*) > 1
        `);
        if (multiNurse.recordset.length > 0) {
            console.log('Users with multiple nurse profiles (Problematic!):');
            console.table(multiNurse.recordset);
        } else {
            console.log('All users have 0 or 1 nurse profile.');
        }

        // 4. Check for records referencing students/nurses but NOT the user directly
        // These are handled by the code, but let's see if there are many.
        const dependentCounts = await pool.request().query(`
            SELECT 'appointments' as table_name, COUNT(*) as count FROM appointments
            UNION ALL
            SELECT 'medical_records', COUNT(*) FROM medical_records
            UNION ALL
            SELECT 'reports', COUNT(*) FROM reports
            UNION ALL
            SELECT 'nurse_availability', COUNT(*) FROM nurse_availability
            UNION ALL
            SELECT 'appointment_waiting_list', COUNT(*) FROM appointment_waiting_list
            UNION ALL
            SELECT 'notifications', COUNT(*) FROM notifications
            UNION ALL
            SELECT 'audit_log', COUNT(*) FROM audit_log
        `);
        console.log('\nTotal record counts in dependent tables:');
        console.table(dependentCounts.recordset);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

analyzeFK();
