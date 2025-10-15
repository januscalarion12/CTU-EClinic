# CTU E-Clinic Database Schema

## Overview
This document outlines the comprehensive database schema for the CTU E-Clinic system, designed to support appointment booking, QR code check-ins, medical record keeping, user management, and reporting functionality.

## Database Schema

### 1. Users Table
Base table for all user types (admin, nurse, student).

```sql
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'nurse', 'student') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_role (role)
);
```

### 2. Students Table
Extended profile information for students.

```sql
CREATE TABLE students (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    student_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    emergency_contact VARCHAR(255),
    qr_code TEXT,
    date_of_birth DATE,
    gender ENUM('male', 'female', 'other'),
    blood_type VARCHAR(10),
    allergies TEXT,
    medical_conditions TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_student_id (student_id),
    INDEX idx_email (email)
);
```

### 3. Nurses Table
Extended profile information for nurses.

```sql
CREATE TABLE nurses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    specialization VARCHAR(255),
    license_number VARCHAR(100) UNIQUE,
    phone VARCHAR(20),
    department VARCHAR(100),
    years_of_experience INT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_email (email),
    INDEX idx_specialization (specialization),
    INDEX idx_department (department)
);
```

### 4. Nurse-Student Assignments
Many-to-many relationship between nurses and students.

```sql
CREATE TABLE nurse_students (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nurse_id INT NOT NULL,
    student_id INT NOT NULL,
    assigned_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (nurse_id) REFERENCES nurses(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    UNIQUE KEY unique_nurse_student (nurse_id, student_id),
    INDEX idx_nurse_id (nurse_id),
    INDEX idx_student_id (student_id)
);
```

### 5. Appointments Table
Appointment bookings between students and nurses.

```sql
CREATE TABLE appointments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    student_id INT NOT NULL,
    nurse_id INT NOT NULL,
    appointment_date DATETIME NOT NULL,
    reason VARCHAR(500),
    status ENUM('pending', 'confirmed', 'completed', 'cancelled', 'no_show') DEFAULT 'pending',
    check_in_time DATETIME,
    check_out_time DATETIME,
    qr_check_in BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (nurse_id) REFERENCES nurses(id) ON DELETE CASCADE,
    INDEX idx_student_id (student_id),
    INDEX idx_nurse_id (nurse_id),
    INDEX idx_appointment_date (appointment_date),
    INDEX idx_status (status),
    INDEX idx_qr_check_in (qr_check_in)
);
```

### 6. Medical Records Table
Health records and visit history.

```sql
CREATE TABLE medical_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    student_id INT NOT NULL,
    nurse_id INT NOT NULL,
    appointment_id INT,
    visit_date DATETIME NOT NULL,
    record_type ENUM('consultation', 'checkup', 'emergency', 'follow_up', 'vaccination') NOT NULL,
    symptoms TEXT,
    diagnosis TEXT,
    treatment TEXT,
    medications TEXT,
    vital_signs JSON,
    notes TEXT,
    follow_up_required BOOLEAN DEFAULT FALSE,
    follow_up_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (nurse_id) REFERENCES nurses(id) ON DELETE CASCADE,
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
    INDEX idx_student_id (student_id),
    INDEX idx_nurse_id (nurse_id),
    INDEX idx_appointment_id (appointment_id),
    INDEX idx_visit_date (visit_date),
    INDEX idx_record_type (record_type)
);
```

### 7. Nurse Availability Table
Nurse scheduling and availability.

```sql
CREATE TABLE nurse_availability (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nurse_id INT NOT NULL,
    day_of_week ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday') NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    max_appointments INT DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (nurse_id) REFERENCES nurses(id) ON DELETE CASCADE,
    UNIQUE KEY unique_nurse_day (nurse_id, day_of_week),
    INDEX idx_nurse_id (nurse_id),
    INDEX idx_day_of_week (day_of_week)
);
```

### 8. Reports Table
Health reports generated by nurses.

```sql
CREATE TABLE reports (
    id INT PRIMARY KEY AUTO_INCREMENT,
    student_id INT NOT NULL,
    nurse_id INT NOT NULL,
    report_type ENUM('health_check', 'vaccination', 'screening', 'consultation', 'emergency') NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    findings TEXT,
    recommendations TEXT,
    attachments JSON,
    is_confidential BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (nurse_id) REFERENCES nurses(id) ON DELETE CASCADE,
    INDEX idx_student_id (student_id),
    INDEX idx_nurse_id (nurse_id),
    INDEX idx_report_type (report_type),
    INDEX idx_created_at (created_at)
);
```

### 9. Notifications Table
System notifications for users.

```sql
CREATE TABLE notifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('appointment_reminder', 'appointment_confirmed', 'appointment_cancelled', 'report_ready', 'system_alert', 'emergency') NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP NULL,
    priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
    related_id INT,
    related_type VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_type (type),
    INDEX idx_is_read (is_read),
    INDEX idx_priority (priority),
    INDEX idx_created_at (created_at)
);
```

### 10. Audit Log Table
System audit trail for security and compliance.

```sql
CREATE TABLE audit_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100),
    record_id INT,
    old_values JSON,
    new_values JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_table_name (table_name),
    INDEX idx_created_at (created_at)
);
```

## Schema Considerations

### Data Integrity
- All foreign key relationships include appropriate CASCADE or SET NULL actions
- Unique constraints prevent duplicate assignments and data conflicts
- ENUM types restrict data to valid values

### Performance Optimizations
- Indexes on frequently queried columns (user_id, email, dates, status)
- Composite indexes for common query patterns
- JSON columns for flexible data storage (vital_signs, attachments)

### Security Features
- Password hashing handled at application level
- Audit logging for all critical operations
- Role-based access control through user roles

### Scalability Considerations
- Auto-incrementing primary keys for all tables
- Timestamp columns for tracking changes
- Flexible JSON fields for future extensions

### Additional Features Supported
- QR code check-in system with timestamp tracking
- Emergency contact information for students
- Nurse specialization and department tracking
- Comprehensive medical record keeping with vital signs
- Notification system for appointment reminders and alerts
- Audit trail for compliance and security
- Flexible reporting system with attachments

This schema provides a solid foundation for the CTU E-Clinic system, supporting all required functionality while maintaining data integrity and performance.