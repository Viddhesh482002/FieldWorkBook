// FieldWorkBook - Working Frontend JavaScript Application

// Global variables
let currentUser = null;
let currentSection = 'dashboard';

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('Application initializing...');
    checkAuthStatus();
    bindEvents();
    initializeDataTables();
});

// Authentication Methods
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth/check');
        const data = await response.json();
        
        if (data.authenticated) {
            currentUser = data.user;
            showMainApp();
            loadDashboardData();
        } else {
            showLoginPage();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        showLoginPage();
    }
}

async function login(username, password) {
    try {
        showLoading();
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        hideLoading();

        if (data.success) {
            currentUser = data.user;
            showMainApp();
            loadDashboardData();
            showToast('Login successful!', 'success');
        } else {
            showToast(data.error || 'Login failed', 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('Login failed. Please try again.', 'error');
        console.error('Login error:', error);
    }
}

async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        currentUser = null;
        showLoginPage();
        showToast('Logged out successfully', 'success');
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// UI Display Methods
function showLoginPage() {
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('mainNav').style.display = 'none';
}

function showMainApp() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    document.getElementById('mainNav').style.display = 'block';
    
    // Update user display
    document.getElementById('userDisplayName').textContent = currentUser.full_name;
    
    // Show/hide role-specific elements
    const adminElements = document.querySelectorAll('.admin-only');
    const fieldStaffElements = document.querySelectorAll('.field-staff-only');
    
    if (currentUser.role === 'admin') {
        adminElements.forEach(el => el.style.display = 'block');
        fieldStaffElements.forEach(el => el.style.display = 'none');
        document.getElementById('adminDashboard').style.display = 'block';
        document.getElementById('fieldStaffDashboard').style.display = 'none';
    } else {
        adminElements.forEach(el => el.style.display = 'none');
        fieldStaffElements.forEach(el => el.style.display = 'block');
        document.getElementById('adminDashboard').style.display = 'none';
        document.getElementById('fieldStaffDashboard').style.display = 'block';
    }
    
    showSection('dashboard');
}

function showSection(section) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(el => {
        el.style.display = 'none';
    });
    
    // Show selected section
    const sectionElement = document.getElementById(section + 'Section');
    if (sectionElement) {
        sectionElement.style.display = 'block';
    }
    currentSection = section;
    
    // Update navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    const activeLink = document.getElementById(section + 'Link');
    if (activeLink) activeLink.classList.add('active');
    
    // Load section data
    loadSectionData(section);
}

// Data Loading Methods
async function loadDashboardData() {
    if (currentUser.role === 'admin') {
        await loadAdminDashboard();
    } else {
        await loadFieldStaffDashboard();
    }
}

async function loadAdminDashboard() {
    try {
        // Load basic stats for now
        document.getElementById('totalTeams').textContent = '0';
        document.getElementById('totalBudget').textContent = '$0';
        document.getElementById('totalUsed').textContent = '$0';
        document.getElementById('pendingRequests').textContent = '0';
        
        // Clear tables
        const tbody = document.querySelector('#teamsOverviewTable tbody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No teams created yet</td></tr>';
        }
        
        const expensesDiv = document.getElementById('recentExpenses');
        if (expensesDiv) {
            expensesDiv.innerHTML = '<p class="text-muted">No recent expenses</p>';
        }

    } catch (error) {
        console.error('Error loading admin dashboard:', error);
        showToast('Error loading dashboard data', 'error');
    }
}

async function loadFieldStaffDashboard() {
    try {
        if (!currentUser.team_id) {
            document.getElementById('teamInfo').innerHTML = '<p class="text-warning">You are not assigned to any team yet.</p>';
            return;
        }

        // Set default values for now
        document.getElementById('teamName').textContent = 'Sample Team';
        document.getElementById('teamLocation').textContent = 'Sample Location';
        document.getElementById('teamInitialAmount').textContent = '$1000.00';
        document.getElementById('teamUsedAmount').textContent = '$0.00';
        document.getElementById('teamRemainingAmount').textContent = '$1000.00';

        // Clear my expenses table
        const tbody = document.querySelector('#myExpensesTable tbody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">No expenses recorded yet</td></tr>';
        }

    } catch (error) {
        console.error('Error loading field staff dashboard:', error);
        showToast('Error loading dashboard data', 'error');
    }
}

async function loadSectionData(section) {
    // Load section-specific data
    console.log('Loading data for section:', section);
}

// Event Binding
function bindEvents() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            login(username, password);
        });
    }

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }

    // Navigation
    const dashboardLink = document.getElementById('dashboardLink');
    if (dashboardLink) {
        dashboardLink.addEventListener('click', (e) => {
            e.preventDefault();
            showSection('dashboard');
        });
    }

    const teamsLink = document.getElementById('teamsLink');
    if (teamsLink) {
        teamsLink.addEventListener('click', (e) => {
            e.preventDefault();
            showSection('teams');
        });
    }

    const expensesLink = document.getElementById('expensesLink');
    if (expensesLink) {
        expensesLink.addEventListener('click', (e) => {
            e.preventDefault();
            showSection('expenses');
        });
    }

    const requestsLink = document.getElementById('requestsLink');
    if (requestsLink) {
        requestsLink.addEventListener('click', (e) => {
            e.preventDefault();
            showSection('requests');
        });
    }

    // Modal triggers
    const createTeamBtn = document.getElementById('createTeamBtn');
    if (createTeamBtn) {
        createTeamBtn.addEventListener('click', () => {
            const modal = new bootstrap.Modal(document.getElementById('createTeamModal'));
            modal.show();
        });
    }

    const addExpenseBtn = document.getElementById('addExpenseBtn');
    if (addExpenseBtn) {
        addExpenseBtn.addEventListener('click', () => {
            const modal = new bootstrap.Modal(document.getElementById('addExpenseModal'));
            modal.show();
        });
    }

    const addExpenseBtn2 = document.getElementById('addExpenseBtn2');
    if (addExpenseBtn2) {
        addExpenseBtn2.addEventListener('click', () => {
            const modal = new bootstrap.Modal(document.getElementById('addExpenseModal'));
            modal.show();
        });
    }

    const requestAmountBtn = document.getElementById('requestAmountBtn');
    if (requestAmountBtn) {
        requestAmountBtn.addEventListener('click', () => {
            const modal = new bootstrap.Modal(document.getElementById('requestAmountModal'));
            modal.show();
        });
    }

    // Form submissions (basic handlers for now)
    const createTeamForm = document.getElementById('createTeamForm');
    if (createTeamForm) {
        createTeamForm.addEventListener('submit', (e) => {
            e.preventDefault();
            showToast('Team creation feature will be implemented soon', 'info');
        });
    }

    const addExpenseForm = document.getElementById('addExpenseForm');
    if (addExpenseForm) {
        addExpenseForm.addEventListener('submit', (e) => {
            e.preventDefault();
            showToast('Expense addition feature will be implemented soon', 'info');
        });
    }

    const requestAmountForm = document.getElementById('requestAmountForm');
    if (requestAmountForm) {
        requestAmountForm.addEventListener('submit', (e) => {
            e.preventDefault();
            showToast('Amount request feature will be implemented soon', 'info');
        });
    }
}

// DataTables Initialization
function initializeDataTables() {
    // Basic DataTables configuration
    if (typeof $ !== 'undefined' && $.fn.dataTable) {
        $.extend(true, $.fn.dataTable.defaults, {
            responsive: true,
            pageLength: 10,
            lengthMenu: [[10, 25, 50, -1], [10, 25, 50, "All"]],
            language: {
                search: "Search:",
                lengthMenu: "Show _MENU_ entries",
                info: "Showing _START_ to _END_ of _TOTAL_ entries",
                infoEmpty: "No entries available",
                paginate: {
                    first: "First",
                    last: "Last",
                    next: "Next",
                    previous: "Previous"
                }
            }
        });
    }
}

// Utility Methods
function showLoading() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        spinner.classList.remove('d-none');
    }
}

function hideLoading() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        spinner.classList.add('d-none');
    }
}

function showToast(message, type = 'info') {
    // Use simple alert for now, can be enhanced with SweetAlert2 later
    if (typeof Swal !== 'undefined') {
        const icon = {
            'success': 'success',
            'error': 'error',
            'warning': 'warning',
            'info': 'info'
        };

        Swal.fire({
            icon: icon[type],
            title: message,
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true
        });
    } else {
        // Fallback to alert
        alert(message);
    }
}

// Global functions for onclick handlers
function showAddUserModal(teamId) {
    document.getElementById('userTeamId').value = teamId;
    const modal = new bootstrap.Modal(document.getElementById('addUserModal'));
    modal.show();
}

function approveRequest(requestId) {
    showToast('Approve request feature will be implemented soon', 'info');
}

function rejectRequest(requestId) {
    showToast('Reject request feature will be implemented soon', 'info');
}

console.log('Working app loaded successfully');
