// Registration-specific JavaScript functions

document.addEventListener('DOMContentLoaded', function() {
    // Additional registration form validation
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        // Real-time password confirmation validation
        const passwordInput = document.getElementById('password');
        const confirmPasswordInput = document.getElementById('confirmPassword');

        if (passwordInput && confirmPasswordInput) {
            confirmPasswordInput.addEventListener('input', function() {
                validatePasswordConfirmation();
            });

            passwordInput.addEventListener('input', function() {
                validatePasswordConfirmation();
            });
        }

        // Email validation
        const emailInput = document.getElementById('email');
        if (emailInput) {
            emailInput.addEventListener('blur', function() {
                validateEmail();
            });
        }

        // Role-specific field display
        const roleSelect = document.getElementById('role');
        if (roleSelect) {
            roleSelect.addEventListener('change', function() {
                toggleRoleSpecificFields();
            });
        }

        // Auto-capitalize first letter for name fields and suffix
        const nameFields = ['firstName', 'middleName', 'lastName', 'suffix'];
        nameFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.addEventListener('input', capitalizeFirstLetter);
            }
        });
    }
});

function validatePasswordConfirmation() {
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const confirmPasswordInput = document.getElementById('confirmPassword');

    if (password !== confirmPassword) {
        confirmPasswordInput.setCustomValidity('Passwords do not match');
        confirmPasswordInput.style.borderColor = '#e74c3c';
    } else {
        confirmPasswordInput.setCustomValidity('');
        confirmPasswordInput.style.borderColor = '#27ae60';
    }
}

function validateEmail() {
    const email = document.getElementById('email').value;
    const emailInput = document.getElementById('email');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
        emailInput.setCustomValidity('Please enter a valid email address');
        emailInput.style.borderColor = '#e74c3c';
    } else {
        emailInput.setCustomValidity('');
        emailInput.style.borderColor = '#27ae60';
    }
}

function toggleRoleSpecificFields() {
    const role = document.getElementById('role').value;
    const studentFields = document.querySelectorAll('.student-field');
    const idNumberLabel = document.getElementById('idNumberLabel');
    const idNumberInput = document.getElementById('idNumber');
    const specializationField = document.getElementById('specialization');

    if (role === 'student') {
        // Show student-specific fields
        studentFields.forEach(field => {
            field.style.display = 'block';
            const inputs = field.querySelectorAll('input, select');
            inputs.forEach(input => input.required = true);
        });
        // Change label to ID Number
        if (idNumberLabel) idNumberLabel.textContent = 'ID Number';
        if (idNumberInput) idNumberInput.name = 'idNumber';
        // Hide nurse-specific fields
        if (specializationField) {
            specializationField.style.display = 'none';
            specializationField.required = false;
        }
    } else if (role === 'nurse') {
        // Hide student-specific fields
        studentFields.forEach(field => {
            field.style.display = 'none';
            const inputs = field.querySelectorAll('input, select');
            inputs.forEach(input => {
                input.required = false;
                input.value = ''; // Clear values
            });
        });
        // Change label to Employee ID
        if (idNumberLabel) idNumberLabel.textContent = 'Employee ID';
        if (idNumberInput) idNumberInput.name = 'employeeId';
        // Show nurse-specific fields if any
        if (specializationField) {
            specializationField.style.display = 'block';
            specializationField.required = true;
        }
    } else {
        // Default: hide all optional fields
        studentFields.forEach(field => {
            field.style.display = 'none';
            const inputs = field.querySelectorAll('input, select');
            inputs.forEach(input => input.required = false);
        });
        if (specializationField) {
            specializationField.style.display = 'none';
            specializationField.required = false;
        }
        // Reset label
        if (idNumberLabel) idNumberLabel.textContent = 'ID Number';
        if (idNumberInput) idNumberInput.name = 'idNumber';
    }
}

// Enhanced registration handler with additional validation
async function handleRegister(e) {
    e.preventDefault();

    // Clear any existing error messages
    clearErrors();

    const formData = new FormData(e.target);
    const registerData = {
        firstName: formData.get('firstName'),
        middleName: formData.get('middleName'),
        lastName: formData.get('lastName'),
        suffix: formData.get('suffix'),
        email: formData.get('email'),
        contactNumber: formData.get('contactNumber'),
        password: formData.get('password'),
        role: formData.get('role')
    };

    // Add role-specific fields
    if (registerData.role === 'student') {
        registerData.idNumber = formData.get('idNumber');
        registerData.schoolYear = formData.get('schoolYear');
        registerData.schoolLevel = formData.get('schoolLevel');
        registerData.department = formData.get('department');
    } else if (registerData.role === 'nurse') {
        registerData.employeeId = formData.get('employeeId');
        // Add specialization if exists
        const specialization = formData.get('specialization');
        if (specialization) registerData.specialization = specialization;
    }

    // Client-side validation
    if (!validateRegistrationData(registerData)) {
        return;
    }

    // Show loading state
    const submitButton = e.target.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.textContent = 'Registering...';
    submitButton.disabled = true;

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
            showSuccess('Registration successful! Please check your email for verification instructions.');
            e.target.reset();

            // Redirect to login after 3 seconds
            setTimeout(() => {
                window.location.href = 'verify-email.html';
            }, 3000);
        } else {
            showError(result.message || 'Registration failed. Please try again.');
        }
    } catch (error) {
        showError('Network error. Please check your connection and try again.');
    } finally {
        // Reset button state
        submitButton.textContent = originalText;
        submitButton.disabled = false;
    }
}

function validateRegistrationData(data) {
    let isValid = true;

    // Name validation
    if (!data.firstName || data.firstName.trim().length < 2 || !/^[a-zA-Z\s]+$/.test(data.firstName)) {
        showFieldError('firstName', 'First name must be at least 2 characters and contain only letters and spaces');
        isValid = false;
    }

    if (!data.lastName || data.lastName.length < 2) {
        showFieldError('lastName', 'Last name must be at least 2 characters long');
        isValid = false;
    }

    // Contact number validation (Philippine format)
    const phPhoneRegex = /^(\+63|0)9\d{9}$/;
    if (!data.contactNumber || !phPhoneRegex.test(data.contactNumber)) {
        showFieldError('contactNumber', 'Please enter a valid Philippine phone number (e.g., +639123456789 or 09123456789)');
        isValid = false;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!data.email || !emailRegex.test(data.email)) {
        showFieldError('email', 'Please enter a valid email address');
        isValid = false;
    }

    // Password validation
    if (!data.password || data.password.length < 8) {
        showFieldError('password', 'Password must be at least 8 characters long');
        isValid = false;
    }

    // Check for password strength
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(data.password)) {
        showFieldError('password', 'Password must contain at least one uppercase letter, one lowercase letter, and one number');
        isValid = false;
    }

    // Role validation
    if (!data.role) {
        showFieldError('role', 'Please select a role');
        isValid = false;
    }

    // Role-specific validation
    if (data.role === 'student') {
        if (!data.idNumber) {
            showFieldError('idNumber', 'ID Number is required for students');
            isValid = false;
        } else if (!/^\d{7}$/.test(data.idNumber)) {
            showFieldError('idNumber', 'ID Number must be exactly 7 digits');
            isValid = false;
        }
        if (!data.schoolYear) {
            showFieldError('schoolYear', 'School Year is required for students');
            isValid = false;
        }
        if (!data.schoolLevel) {
            showFieldError('schoolLevel', 'School Level is required for students');
            isValid = false;
        }
        if (!data.department) {
            showFieldError('department', 'Department is required for students');
            isValid = false;
        }
    } else if (data.role === 'nurse') {
        if (!data.employeeId) {
            showFieldError('idNumber', 'Employee ID is required for nurses');
            isValid = false;
        } else if (!/^\d{5}$/.test(data.employeeId)) {
            showFieldError('idNumber', 'Employee ID must be exactly 5 digits');
            isValid = false;
        }
        // Specialization is optional for nurses
    }

    return isValid;
}

function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (field) {
        field.style.borderColor = '#e74c3c';

        // Create or update error message
        let errorElement = field.parentNode.querySelector('.field-error');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.className = 'field-error';
            errorElement.style.color = '#e74c3c';
            errorElement.style.fontSize = '14px';
            errorElement.style.marginTop = '5px';
            field.parentNode.appendChild(errorElement);
        }
        errorElement.textContent = message;
    }
}

function clearErrors() {
    // Clear field-specific errors
    const errorElements = document.querySelectorAll('.field-error');
    errorElements.forEach(element => element.remove());

    // Reset field border colors
    const fields = document.querySelectorAll('input, select, textarea');
    fields.forEach(field => {
        field.style.borderColor = '#ddd';
    });
}

function capitalizeFirstLetter(event) {
    const input = event.target;
    const value = input.value;
    if (value.length > 0) {
        input.value = value.charAt(0).toUpperCase() + value.slice(1);
    }
}

// Password strength indicator
function updatePasswordStrength() {
    const password = document.getElementById('password').value;
    const strengthIndicator = document.getElementById('passwordStrength');

    if (!strengthIndicator) {
        // Create strength indicator if it doesn't exist
        const indicator = document.createElement('div');
        indicator.id = 'passwordStrength';
        indicator.style.fontSize = '12px';
        indicator.style.marginTop = '5px';
        document.getElementById('password').parentNode.appendChild(indicator);
    }

    let strength = 0;
    let feedback = [];

    if (password.length >= 8) strength++;
    else feedback.push('At least 8 characters');

    if (/[a-z]/.test(password)) strength++;
    else feedback.push('Lowercase letter');

    if (/[A-Z]/.test(password)) strength++;
    else feedback.push('Uppercase letter');

    if (/\d/.test(password)) strength++;
    else feedback.push('Number');

    if (/[^A-Za-z\d]/.test(password)) strength++;
    else feedback.push('Special character');

    const indicator = document.getElementById('passwordStrength');
    switch (strength) {
        case 0:
        case 1:
            indicator.textContent = 'Weak password';
            indicator.style.color = '#e74c3c';
            break;
        case 2:
        case 3:
            indicator.textContent = 'Medium password';
            indicator.style.color = '#f39c12';
            break;
        case 4:
        case 5:
            indicator.textContent = 'Strong password';
            indicator.style.color = '#27ae60';
            break;
    }
}

// Initialize password strength checker
const passwordInput = document.getElementById('password');
if (passwordInput) {
    passwordInput.addEventListener('input', updatePasswordStrength);
}

// Terms and conditions checkbox (if exists)
const termsCheckbox = document.getElementById('acceptTerms');
if (termsCheckbox) {
    termsCheckbox.addEventListener('change', function() {
        const submitButton = document.querySelector('button[type="submit"]');
        submitButton.disabled = !this.checked;
    });
}
