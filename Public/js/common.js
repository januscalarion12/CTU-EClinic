// Common JavaScript functions for the Clinic Management System

// API base URL
const API_BASE_URL = '/api';

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize common functionality
    initializeAuth();
    initializeNavigation();
    initializeForms();
    initializeUserProfileDropdown();
    updateFooterYear();
});

function updateFooterYear() {
    const yearElement = document.getElementById('currentYear');
    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }
}

// Authentication functions
function initializeAuth() {
    const logoutBtn = document.getElementById('logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // Note: Authentication is handled server-side via sessions
    // No client-side token check needed
}

function isPublicPage() {
    const publicPages = ['index.html', 'login.html', 'register.html', 'forgot-password.html', 'reset-password.html'];
    return publicPages.includes(window.location.pathname.split('/').pop());
}

async function logout() {
    try {
        await fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });
    } catch (error) {
        console.error('Logout error:', error);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
}

// Navigation functions
function initializeNavigation() {
    // Add active class to current page in navigation
    const currentPage = window.location.pathname.split('/').pop();
    const navLinks = document.querySelectorAll('nav a');

    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPage) {
            link.classList.add('active');
        }
    });
}

// Form initialization
function initializeForms() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Register form
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    // Profile form
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', handleProfileUpdate);
        loadProfile();
    }

    // Appointment form
    const appointmentForm = document.getElementById('appointmentForm');
    if (appointmentForm) {
        appointmentForm.addEventListener('submit', handleAppointmentBooking);
    }

    // Availability form
    const availabilityForm = document.getElementById('availabilityForm');
    if (availabilityForm) {
        availabilityForm.addEventListener('submit', handleAvailabilitySet);
    }

    // Record form
    const recordForm = document.getElementById('addRecordForm');
    if (recordForm) {
        recordForm.addEventListener('submit', handleRecordSave);
    }

    // Settings form
    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
        settingsForm.addEventListener('submit', handleSettingsSave);
    }

    // Forgot password form
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', handleForgotPassword);
    }

    // Reset password form
    const resetPasswordForm = document.getElementById('resetPasswordForm');
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', handleResetPassword);
    }
}

// Authentication handlers
async function handleLogin(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const loginData = {
        email: formData.get('email'),
        password: formData.get('password'),
        role: formData.get('role')
    };

    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(loginData)
        });

        const result = await response.json();

        if (response.ok) {
            localStorage.setItem('token', result.token);
            localStorage.setItem('user', JSON.stringify(result.user));

            // Redirect based on role
            console.log('Redirecting user with role:', result.user.role);
            const userRole = result.user.role ? result.user.role.toLowerCase() : '';

            switch (userRole) {
                case 'student':
                    window.location.href = 'student.html';
                    break;
                case 'nurse':
                    window.location.href = 'nurse_dashboard.html';
                    break;
                case 'admin':
                    window.location.href = 'admin.html';
                    break;
                default:
                    console.warn('Unknown role, defaulting to index.html');
                    window.location.href = 'index.html';
            }
        } else {
            if (result.redirectTo) {
                showError(result.message || 'Please verify your email.');
                setTimeout(() => {
                    window.location.href = `${result.redirectTo}?email=${encodeURIComponent(result.email || '')}`;
                }, 2000);
            } else {
                showError(result.message || 'Login failed');
            }
        }
    } catch (error) {
        showError('Network error. Please try again.');
    }
}

async function handleRegister(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const registerData = {
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        email: formData.get('email'),
        password: formData.get('password'),
        role: formData.get('role')
    };

    // Validate password confirmation
    if (formData.get('password') !== formData.get('confirmPassword')) {
        showError('Passwords do not match');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(registerData)
        });

        const result = await response.json();

        if (response.ok) {
            showSuccess('Registration successful! Please login.');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        } else {
            showError(result.message || 'Registration failed');
        }
    } catch (error) {
        showError('Network error. Please try again.');
    }
}

async function handleForgotPassword(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const email = formData.get('email');

    try {
        const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });

        const result = await response.json();

        if (response.ok) {
            showSuccess('Password reset link sent to your email.');
        } else {
            showError(result.message || 'Failed to send reset link');
        }
    } catch (error) {
        showError('Network error. Please try again.');
    }
}

async function handleResetPassword(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const newPassword = formData.get('newPassword');
    const confirmPassword = formData.get('confirmPassword');

    if (newPassword !== confirmPassword) {
        showError('Passwords do not match');
        return;
    }

    const token = new URLSearchParams(window.location.search).get('token');

    try {
        const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token, newPassword })
        });

        const result = await response.json();

        if (response.ok) {
            showSuccess('Password reset successful! Please login.');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        } else {
            showError(result.message || 'Password reset failed');
        }
    } catch (error) {
        showError('Network error. Please try again.');
    }
}

// Profile handlers
async function loadProfile() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;

    try {
        const response = await fetch(`${API_BASE_URL}/users/${user.id}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const result = await response.json();

        if (response.ok) {
            // Populate form fields
            Object.keys(result).forEach(key => {
                const element = document.getElementById(key);
                if (element) {
                    element.value = result[key];
                }
            });
        }
    } catch (error) {
        showError('Failed to load profile');
    }
}

async function handleProfileUpdate(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const profileData = Object.fromEntries(formData.entries());

    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;

    try {
        const response = await fetch(`${API_BASE_URL}/users/${user.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(profileData)
        });

        const result = await response.json();

        if (response.ok) {
            showSuccess('Profile updated successfully');
            // Update local storage
            localStorage.setItem('user', JSON.stringify(result));
        } else {
            showError(result.message || 'Failed to update profile');
        }
    } catch (error) {
        showError('Network error. Please try again.');
    }
}

// Appointment handlers
async function handleAppointmentBooking(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const appointmentData = Object.fromEntries(formData.entries());

    try {
        const response = await fetch(`${API_BASE_URL}/appointments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(appointmentData)
        });

        const result = await response.json();

        if (response.ok) {
            showSuccess('Appointment booked successfully');
            e.target.reset();
        } else {
            showError(result.message || 'Failed to book appointment');
        }
    } catch (error) {
        showError('Network error. Please try again.');
    }
}

// Availability handlers
async function handleAvailabilitySet(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const availabilityData = Object.fromEntries(formData.entries());

    try {
        const response = await fetch(`${API_BASE_URL}/availability`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(availabilityData)
        });

        const result = await response.json();

        if (response.ok) {
            showSuccess('Availability set successfully');
            e.target.reset();
            loadAvailability();
        } else {
            showError(result.message || 'Failed to set availability');
        }
    } catch (error) {
        showError('Network error. Please try again.');
    }
}

// Record handlers
async function handleRecordSave(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const recordData = Object.fromEntries(formData.entries());

    const method = recordData.recordId ? 'PUT' : 'POST';
    const url = recordData.recordId
        ? `${API_BASE_URL}/medical-records/${recordData.recordId}`
        : `${API_BASE_URL}/medical-records`;

    // Map fields for medical records API
    const data = {
        ...recordData,
        studentId: recordData.internalStudentId,
        medications: recordData.medication,
        followUpRequired: recordData.followUp === 'yes' ? 1 : 0,
        visitDate: recordData.visitDate || new Date().toISOString()
    };

    if (!data.studentId) {
        showError('Please select a valid student first');
        return;
    }

    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            showSuccess('Record saved successfully');
            e.target.reset();
            document.getElementById('recordForm').style.display = 'none';
            loadRecords();
        } else {
            showError(result.message || 'Failed to save record');
        }
    } catch (error) {
        showError('Network error. Please try again.');
    }
}

// Settings handlers
async function handleSettingsSave(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const settingsData = Object.fromEntries(formData.entries());

    try {
        const response = await fetch(`${API_BASE_URL}/settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(settingsData)
        });

        const result = await response.json();

        if (response.ok) {
            showSuccess('Settings saved successfully');
        } else {
            showError(result.message || 'Failed to save settings');
        }
    } catch (error) {
        showError('Network error. Please try again.');
    }
}

// Utility functions
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message error';
    errorDiv.textContent = message;
    errorDiv.style.position = 'fixed';
    errorDiv.style.top = '70px';
    errorDiv.style.right = '20px';
    errorDiv.style.zIndex = '9999';
    errorDiv.style.padding = '15px 25px';
    errorDiv.style.borderRadius = '8px';
    errorDiv.style.backgroundColor = '#f8d7da';
    errorDiv.style.color = '#721c24';
    errorDiv.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    errorDiv.style.borderLeft = '5px solid #dc3545';

    document.body.appendChild(errorDiv);

    setTimeout(() => {
        errorDiv.style.opacity = '0';
        errorDiv.style.transition = 'opacity 0.5s ease';
        setTimeout(() => errorDiv.remove(), 500);
    }, 5000);
}

function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'message success';
    successDiv.textContent = message;
    successDiv.style.position = 'fixed';
    successDiv.style.top = '70px';
    successDiv.style.right = '20px';
    successDiv.style.zIndex = '9999';
    successDiv.style.padding = '15px 25px';
    successDiv.style.borderRadius = '8px';
    successDiv.style.backgroundColor = '#d4edda';
    successDiv.style.color = '#155724';
    successDiv.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    successDiv.style.borderLeft = '5px solid #28a745';

    document.body.appendChild(successDiv);

    setTimeout(() => {
        successDiv.style.opacity = '0';
        successDiv.style.transition = 'opacity 0.5s ease';
        setTimeout(() => successDiv.remove(), 500);
    }, 5000);
}

function showLoading() {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading';
    loadingDiv.innerHTML = '<p>Loading...</p>';

    const container = document.querySelector('.container') || document.body;
    container.appendChild(loadingDiv);

    return loadingDiv;
}

function hideLoading(loadingDiv) {
    if (loadingDiv) {
        loadingDiv.remove();
    }
}

// Data loading functions
async function loadAppointments() {
    const loading = showLoading();

    try {
        const response = await fetch(`${API_BASE_URL}/appointments`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const appointments = await response.json();

        if (response.ok) {
            displayAppointments(appointments);
        }
    } catch (error) {
        showError('Failed to load appointments');
    } finally {
        hideLoading(loading);
    }
}

async function loadRecords() {
    const loading = showLoading();

    try {
        const response = await fetch(`${API_BASE_URL}/records`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const records = await response.json();

        if (response.ok) {
            displayRecords(records);
        }
    } catch (error) {
        showError('Failed to load records');
    } finally {
        hideLoading(loading);
    }
}

async function loadAvailability() {
    try {
        const response = await fetch(`${API_BASE_URL}/availability`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const availability = await response.json();

        if (response.ok) {
            displayAvailability(availability);
        }
    } catch (error) {
        showError('Failed to load availability');
    }
}

// Display functions
function displayAppointments(appointments) {
    const container = document.getElementById('appointmentsTable').querySelector('tbody');
    container.innerHTML = '';

    appointments.forEach(appointment => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${appointment.date}</td>
            <td>${appointment.time}</td>
            <td>${appointment.nurseName || 'N/A'}</td>
            <td>${appointment.status}</td>
            <td>
                <button onclick="cancelAppointment(${appointment.id})" class="btn-secondary">Cancel</button>
            </td>
        `;
        container.appendChild(row);
    });
}

function displayRecords(records) {
    const container = document.getElementById('recordsContainer');
    container.innerHTML = '';

    records.forEach(record => {
        const recordDiv = document.createElement('div');
        recordDiv.className = 'record-card';
        recordDiv.innerHTML = `
            <h4>Record for ${record.studentName}</h4>
            <p><strong>Diagnosis:</strong> ${record.diagnosis}</p>
            <p><strong>Treatment:</strong> ${record.treatment}</p>
            <p><strong>Medication:</strong> ${record.medication || 'N/A'}</p>
            <p><strong>Date:</strong> ${record.date}</p>
        `;
        container.appendChild(recordDiv);
    });
}

function displayAvailability(availability) {
    const container = document.getElementById('availabilitySlots');
    container.innerHTML = '';

    availability.forEach(slot => {
        const slotDiv = document.createElement('div');
        slotDiv.className = 'availability-slot';
        slotDiv.innerHTML = `
            <p>${slot.date}</p>
            <p>${slot.startTime} - ${slot.endTime}</p>
            <button onclick="deleteAvailability(${slot.id})" class="btn-secondary">Delete</button>
        `;
        container.appendChild(slotDiv);
    });
}

// Action functions
async function cancelAppointment(appointmentId) {
    if (!confirm('Are you sure you want to cancel this appointment?')) return;

    try {
        const response = await fetch(`${API_BASE_URL}/appointments/${appointmentId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.ok) {
            showSuccess('Appointment cancelled successfully');
            loadAppointments();
        } else {
            showError('Failed to cancel appointment');
        }
    } catch (error) {
        showError('Network error. Please try again.');
    }
}

async function deleteAvailability(availabilityId) {
    if (!confirm('Are you sure you want to delete this availability slot?')) return;

    try {
        const response = await fetch(`${API_BASE_URL}/availability/${availabilityId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.ok) {
            showSuccess('Availability deleted successfully');
            loadAvailability();
        } else {
            showError('Failed to delete availability');
        }
    } catch (error) {
        showError('Network error. Please try again.');
    }
}

// Tab switching for admin users page
function showTab(tabName) {
    // Hide all tabs
    const tabs = document.querySelectorAll('.user-list');
    tabs.forEach(tab => tab.style.display = 'none');

    // Remove active class from all buttons
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    // Show selected tab
    document.getElementById(tabName + 'Tab').style.display = 'block';

    // Add active class to clicked button
    event.target.classList.add('active');
}

// Report generation functions
function generateDailyReport() {
    // Implementation for daily report
    showSuccess('Daily report generated');
}

function generateWeeklyReport() {
    // Implementation for weekly report
    showSuccess('Weekly report generated');
}

function generateHealthReport() {
    // Implementation for health report
    showSuccess('Health report generated');
}

function generateUserStats() {
    // Implementation for user stats
    showSuccess('User statistics generated');
}

function generateAppointmentAnalytics() {
    // Implementation for appointment analytics
    showSuccess('Appointment analytics generated');
}

function generateUsageReport() {
    // Implementation for usage report
    showSuccess('Usage report generated');
}

function generateHealthSummary() {
    // Implementation for health summary
    showSuccess('Health summary generated');
}

function printReport() {
    window.print();
}

function exportReport() {
    // Implementation for PDF export
    showSuccess('Report exported as PDF');
}

// QR Scanner functions
let scanner = null;

function startScanner() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const context = canvas.getContext('2d');

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
            video.srcObject = stream;
            video.play();

            scanner = setInterval(() => {
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height);

                if (code) {
                    stopScanner();
                    handleQRCode(code.data);
                }
            }, 100);
        })
        .catch(error => {
            showError('Camera access denied or not available');
        });
}

function stopScanner() {
    if (scanner) {
        clearInterval(scanner);
        scanner = null;
    }

    const video = document.getElementById('video');
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
    }
}

function handleQRCode(data) {
    // Process QR code data
    document.getElementById('scanResult').style.display = 'block';
    document.getElementById('studentInfo').innerHTML = `<p>QR Code Data: ${data}</p>`;
}

// Initialize scanner if on scanner page
if (document.getElementById('startScan')) {
    document.getElementById('startScan').addEventListener('click', startScanner);
    document.getElementById('stopScan').addEventListener('click', stopScanner);
}

// User Profile Dropdown functionality
function initializeUserProfileDropdown() {
    const dropdownToggle = document.getElementById('dropdownToggle');
    const profileDropdown = document.getElementById('profileDropdown');

    if (dropdownToggle && profileDropdown) {
        // Toggle dropdown on click
        dropdownToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            const isOpen = profileDropdown.classList.contains('show');

            // Close all dropdowns first
            closeAllDropdowns();

            if (!isOpen) {
                profileDropdown.classList.add('show');
                dropdownToggle.classList.add('rotated');
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            if (!dropdownToggle.contains(e.target) && !profileDropdown.contains(e.target)) {
                closeAllDropdowns();
            }
        });

        // Close dropdown on escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeAllDropdowns();
            }
        });
    }

    // Load user information from localStorage
    loadUserInfo();
}

function closeAllDropdowns() {
    const dropdowns = document.querySelectorAll('.profile-dropdown');
    const toggles = document.querySelectorAll('.dropdown-toggle');

    dropdowns.forEach(dropdown => dropdown.classList.remove('show'));
    toggles.forEach(toggle => toggle.classList.remove('rotated'));
}

async function loadUserInfo() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${API_BASE_URL}/auth/profile`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (response.ok) {
            // Update localStorage with fresh data
            localStorage.setItem('user', JSON.stringify({
                id: result.id,
                firstName: result.firstName,
                lastName: result.lastName,
                name: result.name,
                email: result.email,
                role: result.role,
                ctuId: result.ctuId,
                schoolYear: result.schoolYear,
                schoolLevel: result.schoolLevel,
                department: result.department
            }));

            // Update UI elements
            const userNameElement = document.getElementById('userName');
            const userRoleElement = document.getElementById('userRole');

            if (userNameElement) {
                userNameElement.textContent = result.name;
            }

            if (userRoleElement) {
                userRoleElement.textContent = result.role.charAt(0).toUpperCase() + result.role.slice(1);
            }
        } else {
            console.error('Failed to load user profile:', result.message);
            // Fallback to localStorage if API fails
            const user = JSON.parse(localStorage.getItem('user'));
            if (user) {
                const userNameElement = document.getElementById('userName');
                const userRoleElement = document.getElementById('userRole');

                if (userNameElement) {
                    userNameElement.textContent = user.name || `${user.firstName} ${user.lastName}`;
                }

                if (userRoleElement) {
                    userRoleElement.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
                }
            }
        }
    } catch (error) {
        console.error('Error loading user info:', error);
        // Fallback to localStorage if network error
        const user = JSON.parse(localStorage.getItem('user'));
        if (user) {
            const userNameElement = document.getElementById('userName');
            const userRoleElement = document.getElementById('userRole');

            if (userNameElement) {
                userNameElement.textContent = user.name || `${user.firstName} ${user.lastName}`;
            }

            if (userRoleElement) {
                userRoleElement.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
            }
        }
    }
}