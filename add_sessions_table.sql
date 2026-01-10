-- Add sessions table for express-session
-- Run this if the sessions table is missing

USE CTU;
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='sessions' AND xtype='U')
BEGIN
    CREATE TABLE sessions (
        sid NVARCHAR(255) NOT NULL PRIMARY KEY,
        session NVARCHAR(MAX) NOT NULL,
        expires DATETIME2 NOT NULL
    );

    CREATE INDEX idx_sessions_expires ON sessions(expires);
END
GO