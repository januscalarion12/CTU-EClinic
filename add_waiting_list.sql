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
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE NO ACTION,
    FOREIGN KEY (nurse_id) REFERENCES nurses(id) ON DELETE NO ACTION
);

CREATE INDEX idx_waiting_list_student_id ON appointment_waiting_list(student_id);
CREATE INDEX idx_waiting_list_nurse_id ON appointment_waiting_list(nurse_id);
CREATE INDEX idx_waiting_list_requested_date ON appointment_waiting_list(requested_date);
CREATE INDEX idx_waiting_list_status ON appointment_waiting_list(status);
CREATE INDEX idx_waiting_list_priority ON appointment_waiting_list(priority);