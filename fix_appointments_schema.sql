-- Fix appointments table schema by adding missing columns
-- Run this script in SQL Server Management Studio or similar tool

USE CTU;
GO

-- Add urgency column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('appointments') AND name = 'urgency')
BEGIN
    ALTER TABLE appointments ADD urgency NVARCHAR(20) DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'urgent'));
END

-- Add attachments column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('appointments') AND name = 'attachments')
BEGIN
    ALTER TABLE appointments ADD attachments NVARCHAR(MAX);
END

-- Add qr_code column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('appointments') AND name = 'qr_code')
BEGIN
    ALTER TABLE appointments ADD qr_code NVARCHAR(MAX);
END

-- Add symptoms column (separate from notes)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('appointments') AND name = 'symptoms')
BEGIN
    ALTER TABLE appointments ADD symptoms NVARCHAR(MAX);
END

-- Add additional_notes column (separate from notes)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('appointments') AND name = 'additional_notes')
BEGIN
    ALTER TABLE appointments ADD additional_notes NVARCHAR(MAX);
END

GO