-- Insert Admin Account Query for SSMS
-- Run this query in SQL Server Management Studio (SSMS) to create an admin account

-- Note: Replace 'your_admin_password_hash_here' with the actual bcrypt hash of your desired password
-- You can generate the hash using Node.js: require('bcryptjs').hashSync('yourpassword', 10)

INSERT INTO users (
    role,
    first_name,
    middle_name,
    last_name,
    extension_name,
    ctu_id,
    email,
    contact_number,
    password_hash,
    is_email_confirmed,
    school_year,
    school_level,
    department
) VALUES (
    'admin',
    'Admin',
    NULL,
    'User',
    NULL,
    'ADMIN001',
    'admin@ctu.edu.ph',
    '+63 123 456 7890',
    '$2a$10$PebH7vEpASIYI/Xj53y9/.TKHYs1k5eEWJwe9u0Zp3D3FP8jvk/SC', -- Bcrypt hash for password 'admin123'
    1, -- Email confirmed
    NULL,
    NULL,
    'Administration'
);

-- To generate the password hash in Node.js, run:
-- const bcrypt = require('bcryptjs');
-- const hash = bcrypt.hashSync('yourpassword', 10);
-- console.log(hash);