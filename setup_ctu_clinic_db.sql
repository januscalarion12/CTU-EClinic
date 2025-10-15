-- SQL Server setup script for CTU E-Clinic database
-- Execute this script in SQL Server Management Studio (SSMS) as a sysadmin user

USE master;
GO

-- Create the database
CREATE DATABASE ctu_clinic;
GO

-- Create login with a strong password
CREATE LOGIN ctu_clinic WITH PASSWORD = 'ClinicUserPass123!';
GO

-- Switch to the database
USE ctu_clinic;
GO

-- Create user for the login
CREATE USER ctu_clinic FOR LOGIN ctu_clinic;
GO

-- Grant necessary privileges by adding to db_owner role
EXEC sp_addrolemember 'db_owner', 'ctu_clinic';
GO

-- Optional: Grant specific permissions if db_owner is too broad
-- GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP ON SCHEMA::dbo TO ctu_clinic;
-- GO