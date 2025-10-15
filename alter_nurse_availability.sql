-- Alter nurse_availability table to change time columns from TIME to VARCHAR(8)
-- Execute this script in SQL Server Management Studio (SSMS) after backing up your database

USE ctu_clinic;
GO

-- Alter start_time column
ALTER TABLE nurse_availability
ALTER COLUMN start_time VARCHAR(8) NOT NULL;

-- Alter end_time column
ALTER TABLE nurse_availability
ALTER COLUMN end_time VARCHAR(8) NOT NULL;

GO