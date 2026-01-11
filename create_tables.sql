-- CTU  Database Tables Creation Script for SQL Server

CREATE TABLE users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    role NVARCHAR(20) NOT NULL CHECK (role IN ('nurse', 'student', 'admin')),
    first_name NVARCHAR(100) NOT NULL,
    middle_name NVARCHAR(100),
    last_name NVARCHAR(100) NOT NULL,
    extension_name NVARCHAR(20),
    ctu_id NVARCHAR(50) UNIQUE,
    email NVARCHAR(255) UNIQUE NOT NULL,
    contact_number NVARCHAR(20),
    password_hash NVARCHAR(255) NOT NULL,
    is_email_confirmed BIT DEFAULT 0,
    verification_code NVARCHAR(10),
    verification_expires DATETIME2,
    school_year NVARCHAR(20) NULL,
    school_level NVARCHAR(50) NULL,
    department NVARCHAR(100) NULL,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

CREATE TABLE students (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL,
    student_id NVARCHAR(50) UNIQUE NOT NULL,
    name NVARCHAR(255) NOT NULL,
    email NVARCHAR(255) NOT NULL,
    phone NVARCHAR(20),
    address NVARCHAR(MAX),
    emergency_contact NVARCHAR(255),
    qr_code NVARCHAR(MAX),
    date_of_birth DATE,
    gender NVARCHAR(10) CHECK (gender IN ('male', 'female', 'other')),
    blood_type NVARCHAR(10),
    allergies NVARCHAR(MAX),
    medical_conditions NVARCHAR(MAX),
    school_year NVARCHAR(20),
    school_level NVARCHAR(50),
    department NVARCHAR(100),
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION
);

CREATE INDEX idx_students_user_id ON students(user_id);
CREATE INDEX idx_students_student_id ON students(student_id);
CREATE INDEX idx_students_email ON students(email);

CREATE TABLE nurses (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL,
    name NVARCHAR(255) NOT NULL,
    email NVARCHAR(255) NOT NULL,
    specialization NVARCHAR(255),
    license_number NVARCHAR(100) UNIQUE,
    phone NVARCHAR(20),
    department NVARCHAR(100),
    years_of_experience INT,
    is_active BIT DEFAULT 1,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION
);

CREATE INDEX idx_nurses_user_id ON nurses(user_id);
CREATE INDEX idx_nurses_email ON nurses(email);
CREATE INDEX idx_nurses_specialization ON nurses(specialization);
CREATE INDEX idx_nurses_department ON nurses(department);

CREATE TABLE nurse_students (
    id INT IDENTITY(1,1) PRIMARY KEY,
    nurse_id INT NOT NULL,
    student_id INT NOT NULL,
    assigned_date DATETIME2 DEFAULT GETDATE(),
    is_active BIT DEFAULT 1,
    created_at DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (nurse_id) REFERENCES nurses(id) ON DELETE CASCADE ON UPDATE NO ACTION,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE ON UPDATE NO ACTION,
    UNIQUE (nurse_id, student_id)
);

CREATE INDEX idx_nurse_students_nurse_id ON nurse_students(nurse_id);
CREATE INDEX idx_nurse_students_student_id ON nurse_students(student_id);

CREATE TABLE appointments (
    id INT IDENTITY(1,1) PRIMARY KEY,
    student_id INT NOT NULL,
    nurse_id INT NOT NULL,
    appointment_date DATETIME2 NOT NULL,
    reason NVARCHAR(500),
    urgency NVARCHAR(20) DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'urgent')),
    symptoms NVARCHAR(MAX),
    additional_notes NVARCHAR(MAX),
    attachments NVARCHAR(MAX),
    status NVARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show', 'archived')),
    check_in_time DATETIME2,
    check_out_time DATETIME2,
    qr_check_in BIT DEFAULT 0,
    qr_code NVARCHAR(MAX),
    notes NVARCHAR(MAX),
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    is_archived BIT DEFAULT 0,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (nurse_id) REFERENCES nurses(id) ON DELETE NO ACTION
);

CREATE INDEX idx_appointments_student_id ON appointments(student_id);
CREATE INDEX idx_appointments_nurse_id ON appointments(nurse_id);
CREATE INDEX idx_appointments_appointment_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_qr_check_in ON appointments(qr_check_in);

CREATE TABLE medical_records (
    id INT IDENTITY(1,1) PRIMARY KEY,
    student_id INT NOT NULL,
    nurse_id INT NOT NULL,
    appointment_id INT,
    visit_date DATETIME2 NOT NULL,
    record_type NVARCHAR(50) NOT NULL CHECK (record_type IN ('consultation', 'checkup', 'emergency', 'follow_up', 'vaccination', 'consultation_archived', 'checkup_archived', 'emergency_archived', 'follow_up_archived', 'vaccination_archived')),
    symptoms NVARCHAR(MAX),
    diagnosis NVARCHAR(MAX),
    treatment NVARCHAR(MAX),
    medications NVARCHAR(MAX),
    vital_signs NVARCHAR(MAX),
    notes NVARCHAR(MAX),
    follow_up_required BIT DEFAULT 0,
    follow_up_date DATE,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (nurse_id) REFERENCES nurses(id) ON DELETE NO ACTION,
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE NO ACTION
);

CREATE INDEX idx_medical_records_student_id ON medical_records(student_id);
CREATE INDEX idx_medical_records_nurse_id ON medical_records(nurse_id);
CREATE INDEX idx_medical_records_appointment_id ON medical_records(appointment_id);
CREATE INDEX idx_medical_records_visit_date ON medical_records(visit_date);
CREATE INDEX idx_medical_records_record_type ON medical_records(record_type);

CREATE TABLE nurse_availability (
    id INT IDENTITY(1,1) PRIMARY KEY,
    nurse_id INT NOT NULL,
    availability_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_patients INT DEFAULT 10,
    is_available BIT DEFAULT 1,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (nurse_id) REFERENCES nurses(id) ON DELETE NO ACTION,
    UNIQUE (nurse_id, availability_date, start_time)
);

CREATE INDEX idx_nurse_availability_nurse_id ON nurse_availability(nurse_id);
CREATE INDEX idx_nurse_availability_date ON nurse_availability(availability_date);

CREATE TABLE reports (
    id INT IDENTITY(1,1) PRIMARY KEY,
    student_id INT NOT NULL,
    nurse_id INT NOT NULL,
    report_type NVARCHAR(50) NOT NULL CHECK (report_type IN ('health_check', 'vaccination', 'screening', 'consultation', 'emergency', 'health_check_archived', 'vaccination_archived', 'screening_archived', 'consultation_archived', 'emergency_archived')),
    title NVARCHAR(255) NOT NULL,
    description NVARCHAR(MAX),
    findings NVARCHAR(MAX),
    recommendations NVARCHAR(MAX),
    attachments NVARCHAR(MAX),
    is_confidential BIT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (nurse_id) REFERENCES nurses(id) ON DELETE NO ACTION
);

CREATE INDEX idx_reports_student_id ON reports(student_id);
CREATE INDEX idx_reports_nurse_id ON reports(nurse_id);
CREATE INDEX idx_reports_report_type ON reports(report_type);
CREATE INDEX idx_reports_created_at ON reports(created_at);

CREATE TABLE notifications (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL,
    title NVARCHAR(255) NOT NULL,
    message NVARCHAR(MAX) NOT NULL,
    type NVARCHAR(30) NOT NULL CHECK (type IN ('appointment_reminder', 'appointment_confirmed', 'appointment_cancelled', 'report_ready', 'system_alert', 'emergency')),
    is_read BIT DEFAULT 0,
    read_at DATETIME2 NULL,
    priority NVARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    related_id INT,
    related_type NVARCHAR(50),
    created_at DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_priority ON notifications(priority);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

CREATE TABLE audit_log (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT,
    action NVARCHAR(100) NOT NULL,
    table_name NVARCHAR(100),
    record_id INT,
    old_values NVARCHAR(MAX),
    new_values NVARCHAR(MAX),
    ip_address NVARCHAR(45),
    user_agent NVARCHAR(MAX),
    created_at DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_table_name ON audit_log(table_name);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- Add waiting list table for appointment booking
CREATE TABLE appointment_waiting_list (
    id INT IDENTITY(1,1) PRIMARY KEY,
    student_id INT NOT NULL,
    nurse_id INT NOT NULL,
    requested_date DATE NOT NULL,
    requested_time TIME,
    reason NVARCHAR(500),
    priority INT DEFAULT 0, -- Higher priority gets preference when slots open
    status NVARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'offered', 'expired', 'cancelled')),
    offered_at DATETIME2,
    expires_at DATETIME2,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (nurse_id) REFERENCES nurses(id) ON DELETE NO ACTION
);

CREATE INDEX idx_waiting_list_student_id ON appointment_waiting_list(student_id);
CREATE INDEX idx_waiting_list_nurse_id ON appointment_waiting_list(nurse_id);
CREATE INDEX idx_waiting_list_requested_date ON appointment_waiting_list(requested_date);
CREATE INDEX idx_waiting_list_status ON appointment_waiting_list(status);
CREATE INDEX idx_waiting_list_priority ON appointment_waiting_list(priority);

-- Sessions table for express-session with connect-mssql-v2
CREATE TABLE sessions (
    sid NVARCHAR(255) NOT NULL PRIMARY KEY,
    session NVARCHAR(MAX) NOT NULL,
    expires DATETIME2 NOT NULL
);

CREATE INDEX idx_sessions_expires ON sessions(expires);
-- Add system settings table
CREATE TABLE system_settings (
    id INT IDENTITY(1,1) PRIMARY KEY,
    setting_key NVARCHAR(100) UNIQUE NOT NULL,
    setting_value NVARCHAR(MAX),
    updated_at DATETIME2 DEFAULT GETDATE()
);
CREATE INDEX idx_settings_key ON system_settings(setting_key);