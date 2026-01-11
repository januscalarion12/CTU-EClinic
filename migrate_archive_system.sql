-- Simplified direct Migration script without dbo prefix

-- 1. Update Appointments table
PRINT 'Updating Appointments table...';
ALTER TABLE appointments ALTER COLUMN notes NVARCHAR(MAX);
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('appointments') AND name = 'is_archived')
BEGIN
    ALTER TABLE appointments ADD is_archived BIT DEFAULT 0;
END
GO

-- 2. Update Medical Records table
PRINT 'Updating Medical Records table...';
ALTER TABLE medical_records ALTER COLUMN record_type NVARCHAR(50) NOT NULL;
ALTER TABLE medical_records ALTER COLUMN notes NVARCHAR(MAX);
ALTER TABLE medical_records ALTER COLUMN symptoms NVARCHAR(MAX);
ALTER TABLE medical_records ALTER COLUMN diagnosis NVARCHAR(MAX);
ALTER TABLE medical_records ALTER COLUMN treatment NVARCHAR(MAX);
ALTER TABLE medical_records ALTER COLUMN medications NVARCHAR(MAX);
ALTER TABLE medical_records ALTER COLUMN vital_signs NVARCHAR(MAX);

-- Update record_type CHECK constraint
DECLARE @ConstraintName nvarchar(200)
SELECT @ConstraintName = Name FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID('medical_records') AND definition LIKE '%record_type%'
IF @ConstraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE medical_records DROP CONSTRAINT ' + @ConstraintName)
END

ALTER TABLE medical_records ADD CONSTRAINT ck_medical_records_type 
CHECK (record_type IN ('consultation', 'checkup', 'emergency', 'follow_up', 'vaccination', 'consultation_archived', 'checkup_archived', 'emergency_archived', 'follow_up_archived', 'vaccination_archived'));
GO

-- 3. Update Reports table
PRINT 'Updating Reports table...';
ALTER TABLE reports ALTER COLUMN report_type NVARCHAR(50) NOT NULL;
ALTER TABLE reports ALTER COLUMN description NVARCHAR(MAX);
ALTER TABLE reports ALTER COLUMN findings NVARCHAR(MAX);
ALTER TABLE reports ALTER COLUMN recommendations NVARCHAR(MAX);

-- Update report_type CHECK constraint
DECLARE @ReportConstraintName nvarchar(200)
SELECT @ReportConstraintName = Name FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID('reports') AND definition LIKE '%report_type%'
IF @ReportConstraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE reports DROP CONSTRAINT ' + @ReportConstraintName)
END

ALTER TABLE reports ADD CONSTRAINT ck_reports_type 
CHECK (report_type IN ('health_check', 'vaccination', 'screening', 'consultation', 'emergency', 'health_check_archived', 'vaccination_archived', 'screening_archived', 'consultation_archived', 'emergency_archived'));
GO
