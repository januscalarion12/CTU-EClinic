const { poolPromise, sql } = require('../db');
const { sendAppointmentReminderEmail } = require('./mailer');

// Auto-cancel appointments if student doesn't arrive within 15 minutes
async function autoCancelLateAppointments() {
  try {
    const pool = await poolPromise;

    // Find appointments that are confirmed but student hasn't arrived within 15 minutes of appointment time
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    const request = pool.request();
    const result = await request
      .input('fifteen_minutes_ago', sql.DateTime2, fifteenMinutesAgo)
      .query(`
        SELECT a.id, a.student_id, a.nurse_id, a.appointment_date, 
               ISNULL(NULLIF(LTRIM(RTRIM(s.name)), ''), 
                      ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(u.first_name, '') + ' ' + ISNULL(u.last_name, ''))), ''), s.student_id)) as student_name, 
               s.email as student_email
        FROM appointments a
        JOIN students s ON a.student_id = s.id
        LEFT JOIN users u ON s.user_id = u.id
        WHERE a.status = 'confirmed'
          AND a.check_in_time IS NULL
          AND a.appointment_date <= @fifteen_minutes_ago
      `);

    if (result.recordset.length > 0) {
      console.log(`Auto-cancelling ${result.recordset.length} late appointments`);

      for (const appointment of result.recordset) {
        // Update appointment status to no_show
        const updateRequest = pool.request();
        await updateRequest
          .input('appointment_id', sql.Int, appointment.id)
          .query(`
            UPDATE appointments
            SET status = 'no_show', updated_at = GETDATE()
            WHERE id = @appointment_id
          `);

        // Create notification for the student
        const notificationRequest = pool.request();
        await notificationRequest
          .input('user_id', sql.Int, appointment.student_id)
          .input('title', sql.NVarChar, 'Appointment Auto-Cancelled')
          .input('message', sql.NVarChar, `Your appointment on ${new Date(appointment.appointment_date).toLocaleString()} was automatically cancelled due to no-show.`)
          .input('type', sql.NVarChar, 'appointment_cancelled')
          .input('related_id', sql.Int, appointment.id)
          .input('related_type', sql.NVarChar, 'appointment')
          .query(`
            INSERT INTO notifications (user_id, title, message, type, related_id, related_type)
            VALUES (@user_id, @title, @message, @type, @related_id, @related_type)
          `);

        // Log the auto-cancellation
        const auditRequest = pool.request();
        await auditRequest
          .input('action', sql.NVarChar, 'AUTO_CANCEL_LATE_APPOINTMENT')
          .input('table_name', sql.NVarChar, 'appointments')
          .input('record_id', sql.Int, appointment.id)
          .input('old_values', sql.NVarChar, JSON.stringify({ status: 'confirmed' }))
          .input('new_values', sql.NVarChar, JSON.stringify({ status: 'no_show' }))
          .query(`
            INSERT INTO audit_log (action, table_name, record_id, old_values, new_values)
            VALUES (@action, @table_name, @record_id, @old_values, @new_values)
          `);
      }
    }
  } catch (error) {
    console.error('Error in auto-cancel late appointments:', error);
  }
}

// Send appointment reminders (24 hours before)
async function sendAppointmentReminders() {
  try {
    const pool = await poolPromise;

    // Find confirmed appointments happening tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
    const tomorrowEnd = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 23, 59, 59);

    const request = pool.request();
    const result = await request
      .input('tomorrow_start', sql.DateTime2, tomorrowStart)
      .input('tomorrow_end', sql.DateTime2, tomorrowEnd)
      .query(`
        SELECT a.id, a.appointment_date, a.reason, s.email, 
               ISNULL(NULLIF(LTRIM(RTRIM(s.name)), ''), 
                      ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(u.first_name, '') + ' ' + ISNULL(u.last_name, ''))), ''), s.student_id)) as student_name, 
               n.name as nurse_name
        FROM appointments a
        JOIN students s ON a.student_id = s.id
        LEFT JOIN users u ON s.user_id = u.id
        JOIN nurses n ON a.nurse_id = n.id
        WHERE a.status = 'confirmed'
          AND a.appointment_date >= @tomorrow_start
          AND a.appointment_date <= @tomorrow_end
      `);

    if (result.recordset.length > 0) {
      console.log(`Sending reminders for ${result.recordset.length} appointments`);

      for (const appointment of result.recordset) {
        try {
          await sendAppointmentReminderEmail(appointment.email, {
            date: new Date(appointment.appointment_date).toLocaleDateString(),
            time: new Date(appointment.appointment_date).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            }),
            nurseName: appointment.nurse_name,
            reason: appointment.reason
          });
        } catch (emailError) {
          console.error('Error sending reminder email:', emailError);
        }
      }
    }
  } catch (error) {
    console.error('Error in send appointment reminders:', error);
  }
}

// Archive old records (older than 1 year)
async function archiveOldRecords() {
  try {
    const pool = await poolPromise;

    // Calculate date one year ago
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    // Archive old appointments
    const archiveAppointmentsRequest = pool.request();
    await archiveAppointmentsRequest
      .input('one_year_ago', sql.DateTime2, oneYearAgo)
      .query(`
        UPDATE appointments
        SET status = 'archived'
        WHERE status IN ('completed', 'cancelled', 'no_show')
          AND updated_at < @one_year_ago
      `);

    // Archive old medical records
    const archiveRecordsRequest = pool.request();
    await archiveRecordsRequest
      .input('one_year_ago', sql.DateTime2, oneYearAgo)
      .query(`
        UPDATE medical_records
        SET record_type = CONCAT(record_type, '_archived')
        WHERE updated_at < @one_year_ago
      `);

    // Archive old notifications
    const archiveNotificationsRequest = pool.request();
    await archiveNotificationsRequest
      .input('one_year_ago', sql.DateTime2, oneYearAgo)
      .query(`
        DELETE FROM notifications
        WHERE created_at < @one_year_ago
      `);

    console.log('Old records archived successfully');
  } catch (error) {
    console.error('Error in archive old records:', error);
  }
}

// Run all scheduled tasks
async function runScheduledTasks() {
  console.log('Running scheduled tasks...');

  await autoCancelLateAppointments();
  await sendAppointmentReminders();
  await archiveOldRecords();

  console.log('Scheduled tasks completed');
}

// Export functions for manual execution or testing
module.exports = {
  autoCancelLateAppointments,
  sendAppointmentReminders,
  archiveOldRecords,
  runScheduledTasks
};