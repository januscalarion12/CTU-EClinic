-- Add notification preferences table

USE CTU;
GO

CREATE TABLE notification_preferences (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL,
    email_notifications BIT DEFAULT 1,
    sms_notifications BIT DEFAULT 0,
    push_notifications BIT DEFAULT 1,
    appointment_reminders BIT DEFAULT 1,
    appointment_confirmations BIT DEFAULT 1,
    appointment_cancellations BIT DEFAULT 1,
    medical_record_updates BIT DEFAULT 1,
    system_alerts BIT DEFAULT 1,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (user_id)
);

CREATE INDEX idx_notification_preferences_user_id ON notification_preferences(user_id);

GO