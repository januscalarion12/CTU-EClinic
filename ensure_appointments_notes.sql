-- Ensure appointments table has notes column
-- Run this if archiving is not working

USE CTU;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('appointments') AND name = 'notes')
BEGIN
    ALTER TABLE appointments ADD notes NVARCHAR(MAX);
END
GO