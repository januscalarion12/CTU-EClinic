const qrcode = require('qrcode');

// Generate QR code
const generateQRCode = async (data) => {
  try {
    const qrCodeDataURL = await qrcode.toDataURL(data, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return qrCodeDataURL;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw error;
  }
};

// Generate QR code as buffer
const generateQRCodeBuffer = async (data) => {
  try {
    const qrCodeBuffer = await qrcode.toBuffer(data, {
      errorCorrectionLevel: 'M',
      type: 'png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return qrCodeBuffer;
  } catch (error) {
    console.error('Error generating QR code buffer:', error);
    throw error;
  }
};

// Validate QR code data
const validateQRCode = (qrData) => {
  try {
    const parts = qrData.split(':');
    if (parts.length !== 3) {
      return false;
    }

    const [type, id, timestamp] = parts;
    if (type !== 'student') {
      return false;
    }

    // Check if timestamp is within last 24 hours
    const qrTime = parseInt(timestamp);
    const currentTime = Date.now();
    const timeDiff = currentTime - qrTime;
    const twentyFourHours = 24 * 60 * 60 * 1000;

    return timeDiff <= twentyFourHours;
  } catch (error) {
    console.error('Error validating QR code:', error);
    return false;
  }
};

// Extract student ID from QR code
const extractStudentIdFromQR = (qrData) => {
  try {
    const parts = qrData.split(':');
    if (parts.length !== 3 || parts[0] !== 'student') {
      return null;
    }
    return parts[1];
  } catch (error) {
    console.error('Error extracting student ID from QR:', error);
    return null;
  }
};

// Extract appointment ID from QR code
const extractAppointmentIdFromQR = (qrData) => {
  try {
    const parts = qrData.split(':');
    if (parts.length !== 4 || parts[0] !== 'appointment') {
      return null;
    }
    return parts[1];
  } catch (error) {
    console.error('Error extracting appointment ID from QR:', error);
    return null;
  }
};

module.exports = {
  generateQRCode,
  generateQRCodeBuffer,
  validateQRCode,
  extractStudentIdFromQR,
  extractAppointmentIdFromQR
};