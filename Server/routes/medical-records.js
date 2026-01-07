const express = require('express');
const router = express.Router();
const { poolPromise, sql } = require('../db');
const { authorizeRole } = require('../middleware/auth');

// Helper function to get nurse ID from user ID
async function getNurseId(userId) {
  const pool = await poolPromise;
  const nurseRequest = pool.request();
  const nurseResult = await nurseRequest
    .input('user_id', sql.Int, userId)
    .query('SELECT id FROM nurses WHERE user_id = @user_id');

  if (nurseResult.recordset.length === 0) {
    throw new Error('Nurse profile not found');
  }

  return nurseResult.recordset[0].id;
}

// Get medical records for a student
router.get('/student/:studentId', authorizeRole(['nurse']), async (req, res) => {
  try {
    const { studentId } = req.params;
    const userId = req.user.id;
    const nurseId = await getNurseId(userId);

    // Verify nurse has access to this student (assigned OR has appointment)
    const pool = await poolPromise;
    const accessRequest = pool.request();
    const accessResult = await accessRequest
      .input('nurse_id', sql.Int, nurseId)
      .input('student_id', sql.Int, studentId)
      .query(`
        SELECT id FROM nurse_students WHERE nurse_id = @nurse_id AND student_id = @student_id AND is_active = 1
        UNION
        SELECT id FROM appointments WHERE nurse_id = @nurse_id AND student_id = @student_id
      `);

    if (accessResult.recordset.length === 0) {
      return res.status(403).json({ message: 'Access denied to this student\'s records' });
    }

    const request = pool.request();
    const result = await request
      .input('student_id', sql.Int, studentId)
      .query(`
        SELECT mr.*, n.name as nurse_name, a.appointment_date, a.reason as appointment_reason
        FROM medical_records mr
        JOIN nurses n ON mr.nurse_id = n.id
        LEFT JOIN appointments a ON mr.appointment_id = a.id
        WHERE mr.student_id = @student_id
        ORDER BY mr.visit_date DESC, mr.created_at DESC
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching medical records:', error);
    if (error.message === 'Nurse profile not found') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error fetching medical records' });
  }
});

// Create medical record
router.post('/', authorizeRole(['nurse']), async (req, res) => {
  try {
    const {
      studentId,
      appointmentId,
      recordType,
      symptoms,
      diagnosis,
      treatment,
      medications,
      vitalSigns,
      notes,
      followUpRequired,
      followUpDate
    } = req.body;
    const userId = req.user.id;
    const nurseId = await getNurseId(userId);

    // Verify nurse has access to this student (assigned OR has appointment)
    const pool = await poolPromise;
    const accessRequest = pool.request();
    const accessResult = await accessRequest
      .input('nurse_id', sql.Int, nurseId)
      .input('student_id', sql.Int, studentId)
      .query(`
        SELECT id FROM nurse_students WHERE nurse_id = @nurse_id AND student_id = @student_id AND is_active = 1
        UNION
        SELECT id FROM appointments WHERE nurse_id = @nurse_id AND student_id = @student_id
      `);

    if (accessResult.recordset.length === 0) {
      return res.status(403).json({ message: 'Access denied to this student' });
    }

    const insertRequest = pool.request();
    const result = await insertRequest
      .input('student_id', sql.Int, studentId)
      .input('nurse_id', sql.Int, nurseId)
      .input('appointment_id', sql.Int, appointmentId || null)
      .input('record_type', sql.VarChar, recordType)
      .input('symptoms', sql.NVarChar, symptoms || null)
      .input('diagnosis', sql.NVarChar, diagnosis || null)
      .input('treatment', sql.NVarChar, treatment || null)
      .input('medications', sql.NVarChar, medications || null)
      .input('vital_signs', sql.NVarChar, vitalSigns || null)
      .input('notes', sql.NVarChar, notes || null)
      .input('follow_up_required', sql.Bit, followUpRequired || 0)
      .input('follow_up_date', sql.Date, followUpDate || null)
      .query(`
        INSERT INTO medical_records (
          student_id, nurse_id, appointment_id, record_type, symptoms,
          diagnosis, treatment, medications, vital_signs, notes,
          follow_up_required, follow_up_date
        ) VALUES (
          @student_id, @nurse_id, @appointment_id, @record_type, @symptoms,
          @diagnosis, @treatment, @medications, @vital_signs, @notes,
          @follow_up_required, @follow_up_date
        );
        SELECT SCOPE_IDENTITY() AS id
      `);

    // Update appointment status to completed if this is linked to an appointment
    if (appointmentId) {
      const updateAppointmentRequest = pool.request();
      await updateAppointmentRequest
        .input('appointment_id', sql.Int, appointmentId)
        .query(`
          UPDATE appointments
          SET status = 'completed', check_out_time = GETDATE(), updated_at = GETDATE()
          WHERE id = @appointment_id
        `);
    }

    res.status(201).json({
      message: 'Medical record created successfully',
      recordId: result.recordset[0].id
    });
  } catch (error) {
    console.error('Error creating medical record:', error);
    res.status(500).json({ message: 'Error creating medical record' });
  }
});

// Update medical record
router.put('/:id', authorizeRole(['nurse']), async (req, res) => {
  try {
    const recordId = req.params.id;
    const userId = req.user.id;
    const nurseId = await getNurseId(userId);
    const {
      recordType,
      symptoms,
      diagnosis,
      treatment,
      medications,
      vitalSigns,
      notes,
      followUpRequired,
      followUpDate
    } = req.body;

    const pool = await poolPromise;

    // Verify the record belongs to this nurse
    const verifyRequest = pool.request();
    const verifyResult = await verifyRequest
      .input('record_id', sql.Int, recordId)
      .input('nurse_id', sql.Int, nurseId)
      .query('SELECT id FROM medical_records WHERE id = @record_id AND nurse_id = @nurse_id');

    if (verifyResult.recordset.length === 0) {
      return res.status(403).json({ message: 'Access denied to this medical record' });
    }

    const updateRequest = pool.request();
    await updateRequest
      .input('record_id', sql.Int, recordId)
      .input('record_type', sql.VarChar, recordType)
      .input('symptoms', sql.NVarChar, symptoms || null)
      .input('diagnosis', sql.NVarChar, diagnosis || null)
      .input('treatment', sql.NVarChar, treatment || null)
      .input('medications', sql.NVarChar, medications || null)
      .input('vital_signs', sql.NVarChar, vitalSigns || null)
      .input('notes', sql.NVarChar, notes || null)
      .input('follow_up_required', sql.Bit, followUpRequired || 0)
      .input('follow_up_date', sql.Date, followUpDate || null)
      .query(`
        UPDATE medical_records
        SET record_type = @record_type,
            symptoms = @symptoms,
            diagnosis = @diagnosis,
            treatment = @treatment,
            medications = @medications,
            vital_signs = @vital_signs,
            notes = @notes,
            follow_up_required = @follow_up_required,
            follow_up_date = @follow_up_date,
            updated_at = GETDATE()
        WHERE id = @record_id
      `);

    res.json({ message: 'Medical record updated successfully' });
  } catch (error) {
    console.error('Error updating medical record:', error);
    if (error.message === 'Nurse profile not found') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error updating medical record' });
  }
});

// Delete medical record
router.delete('/:id', authorizeRole(['nurse']), async (req, res) => {
  try {
    const recordId = req.params.id;
    const userId = req.user.id;
    const nurseId = await getNurseId(userId);

    const pool = await poolPromise;

    // Verify the record belongs to this nurse
    const verifyRequest = pool.request();
    const verifyResult = await verifyRequest
      .input('record_id', sql.Int, recordId)
      .input('nurse_id', sql.Int, nurseId)
      .query('SELECT id FROM medical_records WHERE id = @record_id AND nurse_id = @nurse_id');

    if (verifyResult.recordset.length === 0) {
      return res.status(403).json({ message: 'Access denied to this medical record' });
    }

    const deleteRequest = pool.request();
    await deleteRequest
      .input('record_id', sql.Int, recordId)
      .query('DELETE FROM medical_records WHERE id = @record_id');

    res.json({ message: 'Medical record deleted successfully' });
  } catch (error) {
    console.error('Error deleting medical record:', error);
    if (error.message === 'Nurse profile not found') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error deleting medical record' });
  }
});

// Get medical record by ID
router.get('/:id', authorizeRole(['nurse']), async (req, res) => {
  try {
    const recordId = req.params.id;
    const userId = req.user.id;
    const nurseId = await getNurseId(userId);

    const pool = await poolPromise;
    const request = pool.request();
    const result = await request
      .input('record_id', sql.Int, recordId)
      .input('nurse_id', sql.Int, nurseId)
      .query(`
        SELECT mr.*, n.name as nurse_name, s.name as student_name, a.appointment_date
        FROM medical_records mr
        JOIN nurses n ON mr.nurse_id = n.id
        JOIN students s ON mr.student_id = s.id
        LEFT JOIN appointments a ON mr.appointment_id = a.id
        WHERE mr.id = @record_id AND mr.nurse_id = @nurse_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Medical record not found' });
    }

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error fetching medical record:', error);
    if (error.message === 'Nurse profile not found') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error fetching medical record' });
  }
});

module.exports = router;