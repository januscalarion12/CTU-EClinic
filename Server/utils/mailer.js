const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Send password reset email
const sendPasswordResetEmail = async (email, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

  const mailOptions = {
    from: process.env.SMTP_USER,
    to: email,
    subject: 'Password Reset Request',
    html: `
      <h2>Password Reset Request</h2>
      <p>You requested a password reset for your clinic account.</p>
      <p>Click the link below to reset your password:</p>
      <a href="${resetUrl}">Reset Password</a>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Password reset email sent to:', email);
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
};

// Send booking confirmation email
const sendBookingConfirmationEmail = async (email, bookingDetails) => {
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: email,
    subject: 'Booking Confirmation',
    html: `
      <h2>Booking Confirmed</h2>
      <p>Your appointment has been confirmed with the following details:</p>
      <ul>
        <li><strong>Date:</strong> ${bookingDetails.date}</li>
        <li><strong>Time:</strong> ${bookingDetails.time}</li>
        <li><strong>Nurse:</strong> ${bookingDetails.nurseName}</li>
        <li><strong>Reason:</strong> ${bookingDetails.reason}</li>
      </ul>
      <p>Please arrive 15 minutes early for your appointment.</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Booking confirmation email sent to:', email);
  } catch (error) {
    console.error('Error sending booking confirmation email:', error);
    throw error;
  }
};

// Send report notification email
const sendReportNotificationEmail = async (email, reportDetails) => {
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: email,
    subject: 'New Health Report Available',
    html: `
      <h2>New Health Report</h2>
      <p>A new health report has been created for you:</p>
      <ul>
        <li><strong>Report Type:</strong> ${reportDetails.type}</li>
        <li><strong>Date:</strong> ${reportDetails.date}</li>
        <li><strong>Nurse:</strong> ${reportDetails.nurseName}</li>
      </ul>
      <p>Please log in to your account to view the full report.</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Report notification email sent to:', email);
  } catch (error) {
    console.error('Error sending report notification email:', error);
    throw error;
  }
};

// Send appointment status notification email
const sendAppointmentStatusEmail = async (email, appointmentDetails) => {
  const statusText = appointmentDetails.status === 'confirmed' ? 'confirmed' : 'cancelled';
  const subject = `Appointment ${statusText.charAt(0).toUpperCase() + statusText.slice(1)}`;

  const mailOptions = {
    from: process.env.SMTP_USER,
    to: email,
    subject: subject,
    html: `
      <h2>Appointment ${statusText.charAt(0).toUpperCase() + statusText.slice(1)}</h2>
      <p>Your appointment has been ${statusText}:</p>
      <ul>
        <li><strong>Date:</strong> ${appointmentDetails.date}</li>
        <li><strong>Time:</strong> ${appointmentDetails.time}</li>
        <li><strong>Nurse:</strong> ${appointmentDetails.nurseName}</li>
        <li><strong>Reason:</strong> ${appointmentDetails.reason}</li>
      </ul>
      ${appointmentDetails.notes ? `<p><strong>Notes:</strong> ${appointmentDetails.notes}</p>` : ''}
      ${appointmentDetails.status === 'confirmed' ?
        '<p>Please arrive 15 minutes early for your appointment.</p>' :
        '<p>If you have any questions, please contact the clinic.</p>'
      }
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Appointment ${statusText} email sent to:`, email);
  } catch (error) {
    console.error(`Error sending appointment ${statusText} email:`, error);
    throw error;
  }
};

// Send new appointment request notification email to nurse
const sendAppointmentRequestEmail = async (email, appointmentDetails) => {
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: email,
    subject: 'New Appointment Request',
    html: `
      <h2>New Appointment Request</h2>
      <p>A student has requested an appointment with you:</p>
      <ul>
        <li><strong>Student:</strong> ${appointmentDetails.studentName}</li>
        <li><strong>Date:</strong> ${appointmentDetails.date}</li>
        <li><strong>Time:</strong> ${appointmentDetails.time}</li>
        <li><strong>Reason:</strong> ${appointmentDetails.reason}</li>
      </ul>
      <p>Please log in to your dashboard to approve or reject this appointment.</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Appointment request email sent to nurse:', email);
  } catch (error) {
    console.error('Error sending appointment request email:', error);
    throw error;
  }
};

module.exports = {
  sendPasswordResetEmail,
  sendBookingConfirmationEmail,
  sendReportNotificationEmail,
  sendAppointmentStatusEmail,
  sendAppointmentRequestEmail
};