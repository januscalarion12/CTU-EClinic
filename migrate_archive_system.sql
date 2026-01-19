-- Migration script for Clinic Management System
-- Converts deprecated ntext columns to NVARCHAR(MAX)
-- Adds necessary columns for archiving functionality

USE CTU;
GO

-- 1. Update Appointments table
PRINT 'Updating Appointments table...';

-- Convert notes from ntext to NVARCHAR(MAX) if necessary
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('appointments') AND name = 'notes')
BEGIN
    ALTER TABLE appointments ALTER COLUMN notes NVARCHAR(MAX);
END

-- Add is_archived column if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('appointments') AND name = 'is_archived')
BEGIN
    ALTER TABLE appointments ADD is_archived BIT DEFAULT 0;
END
GO

-- 2. Update Medical Records table
PRINT 'Updating Medical Records table...';

-- Convert all ntext columns to NVARCHAR(MAX)
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('medical_records') AND name = 'notes')
    ALTER TABLE medical_records ALTER COLUMN notes NVARCHAR(MAX);

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('medical_records') AND name = 'symptoms')
    ALTER TABLE medical_records ALTER COLUMN symptoms NVARCHAR(MAX);

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('medical_records') AND name = 'diagnosis')
    ALTER TABLE medical_records ALTER COLUMN diagnosis NVARCHAR(MAX);

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('medical_records') AND name = 'treatment')
    ALTER TABLE medical_records ALTER COLUMN treatment NVARCHAR(MAX);

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('medical_records') AND name = 'medications')
    ALTER TABLE medical_records ALTER COLUMN medications NVARCHAR(MAX);

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('medical_records') AND name = 'vital_signs')
    ALTER TABLE medical_records ALTER COLUMN vital_signs NVARCHAR(MAX);

-- Update record_type CHECK constraint to include archived types
-- First, drop the old constraint if we know its name, or use a dynamic approach
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

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('reports') AND name = 'description')
    ALTER TABLE reports ALTER COLUMN description NVARCHAR(MAX);

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('reports') AND name = 'findings')
    ALTER TABLE reports ALTER COLUMN findings NVARCHAR(MAX);

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('reports') AND name = 'recommendations')
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

PRINT 'Migration completed successfully.';
