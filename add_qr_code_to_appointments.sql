-- Add qr_code column to appointments table

USE CTU;
GO

ALTER TABLE appointments ADD qr_code NVARCHAR(MAX);
GO