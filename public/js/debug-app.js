// Debug version of the app to identify login issues

console.log('Debug app loading...');

// Simple login function for testing
function testLogin() {
    console.log('Test login function called');
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    console.log('Username:', username);
    console.log('Password:', password);
    
    if (!username || !password) {
        alert('Please enter both username and password');
        return;
    }
    
    // Show loading
    const loginBtn = document.querySelector('button[type="submit"]');
    const originalText = loginBtn.innerHTML;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
    loginBtn.disabled = true;
    
    // Make login request
    fetch('/api/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password })
    })
    .then(response => {
        console.log('Response status:', response.status);
        return response.json();
    })
    .then(data => {
        console.log('Response data:', data);
        
        // Reset button
        loginBtn.innerHTML = originalText;
        loginBtn.disabled = false;
        
        if (data.success) {
            alert('Login successful! Welcome ' + data.user.full_name);
            // Hide login page and show main content
            document.getElementById('loginPage').style.display = 'none';
            document.getElementById('mainContent').style.display = 'block';
            document.getElementById('mainNav').style.display = 'block';
            
            // Update user display
            document.getElementById('userDisplayName').textContent = data.user.full_name;
            
            // Show admin or field staff sections based on role
            if (data.user.role === 'admin') {
                document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
                document.querySelectorAll('.field-staff-only').forEach(el => el.style.display = 'none');
                document.getElementById('adminDashboard').style.display = 'block';
                document.getElementById('fieldStaffDashboard').style.display = 'none';
            } else {
                document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
                document.querySelectorAll('.field-staff-only').forEach(el => el.style.display = 'block');
                document.getElementById('adminDashboard').style.display = 'none';
                document.getElementById('fieldStaffDashboard').style.display = 'block';
            }
        } else {
            alert('Login failed: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Login error:', error);
        
        // Reset button
        loginBtn.innerHTML = originalText;
        loginBtn.disabled = false;
        
        alert('Login failed. Please check the console for details.');
    });
}

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded');
    
    // Bind login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        console.log('Login form found, binding event');
        loginForm.addEventListener('submit', function(e) {
            console.log('Form submit event triggered');
            e.preventDefault();
            testLogin();
        });
    } else {
        console.error('Login form not found!');
    }
    
    // Test server connection
    fetch('/api/auth/check')
        .then(response => response.json())
        .then(data => {
            console.log('Auth check response:', data);
        })
        .catch(error => {
            console.error('Auth check failed:', error);
        });
});

console.log('Debug app loaded');
