const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Test data
let adminToken = '';
let nurseToken = '';
let studentToken = '';
let testStudentId = '';
let testNurseId = '';
let testBookingId = '';

async function loginAsAdmin() {
  try {
    console.log('Logging in as admin...');
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@clinic.com',
      password: 'password123'
    });
    adminToken = response.data.token;
    console.log('✓ Admin login successful');
    return adminToken;
  } catch (error) {
    console.error('✗ Admin login failed:', error.response?.data?.message || error.message);
    throw error;
  }
}

async function loginAsNurse() {
  try {
    console.log('Logging in as nurse...');
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'nurse1@clinic.com',
      password: 'password123'
    });
    nurseToken = response.data.token;
    console.log('✓ Nurse login successful');
    return nurseToken;
  } catch (error) {
    console.error('✗ Nurse login failed:', error.response?.data?.message || error.message);
    throw error;
  }
}

async function loginAsStudent() {
  try {
    console.log('Logging in as student...');
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'student1@clinic.com',
      password: 'password123'
    });
    studentToken = response.data.token;
    console.log('✓ Student login successful');
    return studentToken;
  } catch (error) {
    console.error('✗ Student login failed:', error.response?.data?.message || error.message);
    throw error;
  }
}

async function testStudentBookingFlow() {
  try {
    console.log('\n=== Testing Student Booking Flow ===');

    // Student views available nurses
    console.log('1. Student viewing available nurses...');
    const nursesResponse = await axios.get(`${BASE_URL}/api/student/nurses`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    console.log('✓ Found', nursesResponse.data.length, 'available nurses');

    if (nursesResponse.data.length > 0) {
      testNurseId = nursesResponse.data[0].id;
    }

    // Student creates a booking
    console.log('2. Student creating a booking...');
    const bookingData = {
      nurseId: testNurseId,
      appointmentDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' '), // Tomorrow
      reason: 'Test booking from automated test'
    };

    const bookingResponse = await axios.post(`${BASE_URL}/api/student/bookings`, bookingData, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    testBookingId = bookingResponse.data.bookingId;
    console.log('✓ Booking created with ID:', testBookingId);

    // Student views their bookings
    console.log('3. Student viewing their bookings...');
    const studentBookingsResponse = await axios.get(`${BASE_URL}/api/student/bookings`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    console.log('✓ Student has', studentBookingsResponse.data.length, 'bookings');

    console.log('✓ Student booking flow completed successfully');

  } catch (error) {
    console.error('✗ Student booking flow failed:', error.response?.data?.message || error.message);
    throw error;
  }
}

async function testNurseBookingManagement() {
  try {
    console.log('\n=== Testing Nurse Booking Management ===');

    // Nurse views their students
    console.log('1. Nurse viewing assigned students...');
    const studentsResponse = await axios.get(`${BASE_URL}/api/nurse/students`, {
      headers: { Authorization: `Bearer ${nurseToken}` }
    });
    console.log('✓ Nurse has', studentsResponse.data.length, 'assigned students');

    if (studentsResponse.data.length > 0) {
      testStudentId = studentsResponse.data[0].id;
    }

    // Nurse generates QR code for student
    console.log('2. Nurse generating QR code for student...');
    const qrResponse = await axios.post(`${BASE_URL}/api/nurse/students/${testStudentId}/qr`, {}, {
      headers: { Authorization: `Bearer ${nurseToken}` }
    });
    console.log('✓ QR code generated successfully');

    // Nurse creates a report
    console.log('3. Nurse creating a health report...');
    const reportData = {
      studentId: testStudentId,
      reportType: 'Automated Test Report',
      description: 'This is an automated test report generated during booking flow testing.'
    };

    const reportResponse = await axios.post(`${BASE_URL}/api/nurse/reports`, reportData, {
      headers: { Authorization: `Bearer ${nurseToken}` }
    });
    console.log('✓ Report created with ID:', reportResponse.data.reportId);

    // Nurse views their reports
    console.log('4. Nurse viewing their reports...');
    const reportsResponse = await axios.get(`${BASE_URL}/api/nurse/reports`, {
      headers: { Authorization: `Bearer ${nurseToken}` }
    });
    console.log('✓ Nurse has', reportsResponse.data.length, 'reports');

    console.log('✓ Nurse booking management completed successfully');

  } catch (error) {
    console.error('✗ Nurse booking management failed:', error.response?.data?.message || error.message);
    throw error;
  }
}

async function testAdminDashboard() {
  try {
    console.log('\n=== Testing Admin Dashboard ===');

    // Admin views all users
    console.log('1. Admin viewing all users...');
    const usersResponse = await axios.get(`${BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log('✓ Found', usersResponse.data.length, 'total users');

    // Admin views dashboard stats
    console.log('2. Admin viewing dashboard statistics...');
    const statsResponse = await axios.get(`${BASE_URL}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log('✓ Dashboard stats retrieved successfully');
    console.log('  - Users by role:', JSON.stringify(statsResponse.data.users, null, 2));
    console.log('  - Bookings by status:', JSON.stringify(statsResponse.data.bookings, null, 2));
    console.log('  - Total reports:', statsResponse.data.reports);

    console.log('✓ Admin dashboard test completed successfully');

  } catch (error) {
    console.error('✗ Admin dashboard test failed:', error.response?.data?.message || error.message);
    throw error;
  }
}

async function testStudentReportAccess() {
  try {
    console.log('\n=== Testing Student Report Access ===');

    // Student views their reports
    console.log('1. Student viewing their health reports...');
    const reportsResponse = await axios.get(`${BASE_URL}/api/student/reports`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    console.log('✓ Student has access to', reportsResponse.data.length, 'reports');

    // Student views their profile
    console.log('2. Student viewing their profile...');
    const profileResponse = await axios.get(`${BASE_URL}/api/student/profile`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    console.log('✓ Student profile retrieved:', profileResponse.data.name);

    console.log('✓ Student report access test completed successfully');

  } catch (error) {
    console.error('✗ Student report access test failed:', error.response?.data?.message || error.message);
    throw error;
  }
}

async function runCompleteBookingFlowTest() {
  try {
    console.log('🚀 Starting Complete Booking Flow Test\n');

    // Authentication tests
    await loginAsAdmin();
    await loginAsNurse();
    await loginAsStudent();

    // Functional flow tests
    await testStudentBookingFlow();
    await testNurseBookingManagement();
    await testAdminDashboard();
    await testStudentReportAccess();

    console.log('\n🎉 Complete booking flow test passed successfully!');

  } catch (error) {
    console.error('\n❌ Complete booking flow test failed:', error.message);
    process.exit(1);
  }
}

// Run test if called directly
if (require.main === module) {
  runCompleteBookingFlowTest();
}

module.exports = {
  loginAsAdmin,
  loginAsNurse,
  loginAsStudent,
  testStudentBookingFlow,
  testNurseBookingManagement,
  testAdminDashboard,
  testStudentReportAccess,
  runCompleteBookingFlowTest
};