-- Add urgency and attachments columns to appointments table

USE CTU;
GO

ALTER TABLE appointments ADD urgency NVARCHAR(20) DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'urgent'));
ALTER TABLE appointments ADD attachments NVARCHAR(MAX);
GO