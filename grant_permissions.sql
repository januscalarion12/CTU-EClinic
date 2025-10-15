-- Grant permissions for clinic database user
-- Run this script as root/admin user in MySQL

-- Create database user (remove IF NOT EXISTS for MySQL < 5.7.6)
CREATE USER 'clinic_user'@'localhost' IDENTIFIED BY 'clinic_password_123';

-- Grant all privileges on clinic_db to clinic_user
GRANT ALL PRIVILEGES ON clinic_db.* TO 'clinic_user'@'localhost';

-- Grant permissions for remote access (optional, for development)
-- GRANT ALL PRIVILEGES ON clinic_db.* TO 'clinic_user'@'%' IDENTIFIED BY 'clinic_password_123';

-- Apply privilege changes
FLUSH PRIVILEGES;

-- Show granted permissions (for verification)
SHOW GRANTS FOR 'clinic_user'@'localhost';