-- Alter sessions table to rename 'sess' column to 'session' for connect-mssql-v2 compatibility

USE ctu_clinic;
GO

-- Rename the column from 'sess' to 'session'
EXEC sp_rename 'sessions.sess', 'session', 'COLUMN';
GO