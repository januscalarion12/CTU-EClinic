-- Create sessions table for connect-mssql-v2 session store
-- This table stores session data for the Express.js application

CREATE TABLE sessions (
    sid NVARCHAR(255) NOT NULL PRIMARY KEY,
    session NTEXT NOT NULL,
    expire DATETIME2 NOT NULL
);

CREATE INDEX idx_sessions_expire ON sessions(expire);