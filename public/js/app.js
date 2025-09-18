// FieldWorkBook - Complete Frontend Application

class FieldWorkBookApp {
    constructor() {
        this.currentUser = null;
        this.currentSection = 'dashboard';
        this.init();
    }

    init() {
        console.log('🚀 FieldWorkBook initializing...');
        this.checkAuthStatus();
        this.bindEvents();
        this.initializeDataTables();
    }

    // Authentication Methods
    async checkAuthStatus() {
        try {
            const response = await fetch('/api/auth/check');
            const data = await response.json();
            
            if (data.authenticated) {
                this.currentUser = data.user;
                this.showMainApp();
                this.loadDashboardData();
            } else {
                this.showLoginPage();
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            this.showLoginPage();
        }
    }

    async login(username, password) {
        try {
            this.showLoading();
            console.log('🔐 Attempting login for:', username);
            
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();
            this.hideLoading();

            if (data.success) {
                console.log('✅ Login successful for:', data.user.full_name);
                this.currentUser = data.user;
                this.showMainApp();
                this.loadDashboardData();
                this.showToast('Welcome ' + data.user.full_name + '!', 'success');
            } else {
                console.log('❌ Login failed:', data.error);
                this.showToast(data.error || 'Login failed', 'error');
            }
        } catch (error) {
            this.hideLoading();
            console.error('Login error:', error);
            this.showToast('Login failed. Please check your connection.', 'error');
        }
    }

    async logout() {
        try {
            await fetch('/api/logout', { method: 'POST' });
            this.currentUser = null;
            this.showLoginPage();
            this.showToast('Logged out successfully', 'success');
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    // UI Display Methods
    showLoginPage() {
        console.log('🔄 Switching to login page...');
        
        const loginPage = document.getElementById('loginPage');
        const mainContent = document.getElementById('mainContent');
        const mainNav = document.getElementById('mainNav');
        
        if (loginPage) {
            loginPage.style.display = 'flex';
            loginPage.style.visibility = 'visible';
            loginPage.style.opacity = '1';
            loginPage.classList.add('animate__animated', 'animate__fadeIn');
        }
        
        if (mainContent) {
            mainContent.style.display = 'none';
            mainContent.style.visibility = 'hidden';
            mainContent.style.opacity = '0';
        }
        
        if (mainNav) {
            mainNav.style.display = 'none';
            mainNav.style.visibility = 'hidden';
        }
    }

    showMainApp() {
        console.log('🔄 Switching to main app view...');
        
        // Completely hide login page
        const loginPage = document.getElementById('loginPage');
        const mainContent = document.getElementById('mainContent');
        const mainNav = document.getElementById('mainNav');
        
        if (loginPage) {
            loginPage.style.display = 'none';
            loginPage.style.visibility = 'hidden';
            loginPage.style.opacity = '0';
        }
        
        if (mainContent) {
            mainContent.style.display = 'block';
            mainContent.style.visibility = 'visible';
            mainContent.style.opacity = '1';
        }
        
        if (mainNav) {
            mainNav.style.display = 'block';
            mainNav.style.visibility = 'visible';
        }
        
        // Update user display
        document.getElementById('userDisplayName').textContent = this.currentUser.full_name;
        
        // Show/hide role-specific elements
        const adminElements = document.querySelectorAll('.admin-only');
        const fieldStaffElements = document.querySelectorAll('.field-staff-only');
        
        if (this.currentUser.role === 'admin') {
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
        
        this.showSection('dashboard');
        
        // Add animation
        document.getElementById('mainContent').classList.add('animate__animated', 'animate__fadeIn');
    }

    showSection(section) {
        // Hide all sections
        document.querySelectorAll('.content-section').forEach(el => {
            el.style.display = 'none';
        });
        
        // Show selected section
        const sectionElement = document.getElementById(section + 'Section');
        if (sectionElement) {
            sectionElement.style.display = 'block';
            sectionElement.classList.add('animate__animated', 'animate__fadeIn');
        }
        this.currentSection = section;
        
        // Update navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        
        const activeLink = document.getElementById(section + 'Link');
        if (activeLink) activeLink.classList.add('active');
        
        // Load section data
        this.loadSectionData(section);
    }

    // Data Loading Methods
    async loadDashboardData() {
        if (this.currentUser.role === 'admin') {
            await this.loadAdminDashboard();
        } else {
            await this.loadFieldStaffDashboard();
        }
    }

    async loadAdminDashboard() {
        try {
            console.log('📊 Loading admin dashboard...');
            
            // Load dashboard stats
            const statsResponse = await fetch('/api/dashboard/stats');
            const stats = await statsResponse.json();
            
            // Update stats cards with animation
            this.animateCounter('totalTeams', stats.totalTeams);
            this.animateCounter('totalBudget', '$' + parseFloat(stats.totalBudget).toFixed(2));
            this.animateCounter('totalUsed', '$' + parseFloat(stats.totalUsed).toFixed(2));
            this.animateCounter('pendingRequests', stats.pendingRequests);
            
            // Load teams overview
            const teamsResponse = await fetch('/api/teams');
            const teams = await teamsResponse.json();
            this.loadTeamsOverviewTable(teams);
            
            // Load recent expenses
            const expensesResponse = await fetch('/api/expenses');
            const expenses = await expensesResponse.json();
            this.loadRecentExpenses(expenses.slice(0, 5));

        } catch (error) {
            console.error('Error loading admin dashboard:', error);
            this.showToast('Error loading dashboard data', 'error');
        }
    }

    async loadFieldStaffDashboard() {
        try {
            console.log('👷 Loading field staff dashboard...');
            
            if (!this.currentUser.team_id) {
                document.getElementById('teamInfo').innerHTML = 
                    '<div class="alert alert-warning"><i class="fas fa-exclamation-triangle me-2"></i>You are not assigned to any team yet. Please contact your administrator.</div>';
                return;
            }

            // Load team info
            const teamResponse = await fetch(`/api/teams/${this.currentUser.team_id}`);
            const team = await teamResponse.json();

            if (team.error) {
                document.getElementById('teamInfo').innerHTML = 
                    '<div class="alert alert-danger"><i class="fas fa-times me-2"></i>Error loading team information.</div>';
                return;
            }

            // Normalize numeric values (handle nulls/strings)
            const initialAmountNum = parseFloat(team.initial_amount ?? 0) || 0;
            const usedAmountNum = parseFloat(team.used_amount ?? 0) || 0;
            const remainingAmountNum = parseFloat(team.remaining_amount ?? (initialAmountNum - usedAmountNum)) || 0;

            // Update team information with animation
            document.getElementById('teamName').textContent = team.name;
            document.getElementById('teamLocation').textContent = team.location;
            this.animateCounter('teamInitialAmount', '$' + initialAmountNum.toFixed(2));
            this.animateCounter('teamUsedAmount', '$' + usedAmountNum.toFixed(2));
            this.animateCounter('teamRemainingAmount', '$' + remainingAmountNum.toFixed(2));

            // Update progress bar
            const usagePercentage = initialAmountNum > 0 ? (usedAmountNum / initialAmountNum) * 100 : 0;
            const progressBar = document.getElementById('budgetProgressBar');
            if (progressBar) {
                progressBar.style.width = usagePercentage + '%';
                progressBar.setAttribute('aria-valuenow', usagePercentage);
            }

            // Load my expenses
            const expensesResponse = await fetch('/api/expenses');
            const expenses = await expensesResponse.json();
            this.loadMyExpensesTable(expenses.filter(e => e.user_id === this.currentUser.id));

        } catch (error) {
            console.error('Error loading field staff dashboard:', error);
            this.showToast('Error loading dashboard data', 'error');
        }
    }

    async loadSectionData(section) {
        switch (section) {
            case 'teams':
                await this.loadTeams();
                break;
            case 'expenses':
                await this.loadExpenses();
                break;
            case 'requests':
                await this.loadAmountRequests();
                break;
        }
    }

    // Teams Management
    async loadTeams() {
        try {
            console.log('🏢 Loading teams...');
            const response = await fetch('/api/teams');
            const teams = await response.json();
            this.populateTeamsTable(teams);
        } catch (error) {
            console.error('Error loading teams:', error);
            this.showToast('Error loading teams', 'error');
        }
    }

    async createTeam(teamData) {
        try {
            this.showLoading();
            console.log('🏢 Creating team:', teamData.name);
            
            const response = await fetch('/api/teams', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(teamData)
            });

            const data = await response.json();
            this.hideLoading();

            if (data.success) {
                this.showToast('Team created successfully!', 'success');
                this.loadTeams();
                this.loadDashboardData(); // Refresh dashboard
                bootstrap.Modal.getInstance(document.getElementById('createTeamModal')).hide();
                document.getElementById('createTeamForm').reset();
            } else {
                this.showToast(data.error || 'Failed to create team', 'error');
            }
        } catch (error) {
            this.hideLoading();
            console.error('Create team error:', error);
            this.showToast('Error creating team', 'error');
        }
    }

    async addUserToTeam(userData) {
        try {
            this.showLoading();
            console.log('👤 Adding user to team:', userData.username);
            
            const response = await fetch('/api/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(userData)
            });

            const data = await response.json();
            this.hideLoading();

            if (data.success) {
                this.showToast('Team member added successfully!', 'success');
                this.loadTeams();
                bootstrap.Modal.getInstance(document.getElementById('addUserModal')).hide();
                document.getElementById('addUserForm').reset();
            } else {
                this.showToast(data.error || 'Failed to add team member', 'error');
            }
        } catch (error) {
            this.hideLoading();
            console.error('Add user error:', error);
            this.showToast('Error adding team member', 'error');
        }
    }

    // Expenses Management
    async loadExpenses() {
        try {
            console.log('💰 Loading expenses...');
            const response = await fetch('/api/expenses');
            const expenses = await response.json();
            this.populateExpensesTable(expenses);
        } catch (error) {
            console.error('Error loading expenses:', error);
            this.showToast('Error loading expenses', 'error');
        }
    }

    async addExpense(formData) {
        try {
            this.showLoading();
            console.log('💰 Adding expense...');
            
            const response = await fetch('/api/expenses', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            this.hideLoading();

            if (data.success) {
                this.showToast('Expense added successfully!', 'success');
                this.loadExpenses();
                this.loadDashboardData(); // Refresh dashboard
                bootstrap.Modal.getInstance(document.getElementById('addExpenseModal')).hide();
                document.getElementById('addExpenseForm').reset();
            } else {
                this.showToast(data.error || 'Failed to add expense', 'error');
            }
        } catch (error) {
            this.hideLoading();
            console.error('Add expense error:', error);
            this.showToast('Error adding expense', 'error');
        }
    }

    // Amount Requests Management
    async loadAmountRequests() {
        try {
            console.log('💸 Loading amount requests...');
            const response = await fetch('/api/amount-requests');
            const requests = await response.json();
            this.populateRequestsTable(requests);
        } catch (error) {
            console.error('Error loading requests:', error);
            this.showToast('Error loading requests', 'error');
        }
    }

    async requestAmount(requestData) {
        try {
            this.showLoading();
            console.log('💸 Requesting amount:', requestData.requested_amount);
            
            const response = await fetch('/api/amount-requests', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData)
            });

            const data = await response.json();
            this.hideLoading();

            if (data.success) {
                this.showToast('Amount request submitted successfully!', 'success');
                this.loadAmountRequests();
                bootstrap.Modal.getInstance(document.getElementById('requestAmountModal')).hide();
                document.getElementById('requestAmountForm').reset();
            } else {
                this.showToast(data.error || 'Failed to submit request', 'error');
            }
        } catch (error) {
            this.hideLoading();
            console.error('Request amount error:', error);
            this.showToast('Error submitting request', 'error');
        }
    }

    async approveRequest(requestId) {
        try {
            const result = await Swal.fire({
                title: 'Approve Request?',
                text: 'This will add the requested amount to the team budget.',
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#198754',
                cancelButtonColor: '#6c757d',
                confirmButtonText: 'Yes, approve it!',
                cancelButtonText: 'Cancel'
            });

            if (result.isConfirmed) {
                this.showLoading();
                console.log('✅ Approving request:', requestId);
                
                const response = await fetch(`/api/amount-requests/${requestId}/approve`, {
                    method: 'PUT'
                });

                const data = await response.json();
                this.hideLoading();

                if (data.success) {
                    this.showToast('Request approved successfully!', 'success');
                    this.loadAmountRequests();
                    this.loadDashboardData(); // Refresh dashboard
                } else {
                    this.showToast(data.error || 'Failed to approve request', 'error');
                }
            }
        } catch (error) {
            this.hideLoading();
            console.error('Approve request error:', error);
            this.showToast('Error approving request', 'error');
        }
    }

    async rejectRequest(requestId) {
        try {
            const result = await Swal.fire({
                title: 'Reject Request?',
                text: 'This action cannot be undone.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#dc3545',
                cancelButtonColor: '#6c757d',
                confirmButtonText: 'Yes, reject it!',
                cancelButtonText: 'Cancel'
            });

            if (result.isConfirmed) {
                this.showLoading();
                console.log('❌ Rejecting request:', requestId);
                
                const response = await fetch(`/api/amount-requests/${requestId}/reject`, {
                    method: 'PUT'
                });

                const data = await response.json();
                this.hideLoading();

                if (data.success) {
                    this.showToast('Request rejected', 'info');
                    this.loadAmountRequests();
                } else {
                    this.showToast(data.error || 'Failed to reject request', 'error');
                }
            }
        } catch (error) {
            this.hideLoading();
            console.error('Reject request error:', error);
            this.showToast('Error rejecting request', 'error');
        }
    }

    // Delete team method
    async deleteTeam(teamId) {
        try {
            const result = await Swal.fire({
                title: 'Delete Team?',
                text: 'This will permanently delete the team and all its members. This action cannot be undone!',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#dc3545',
                cancelButtonColor: '#6c757d',
                confirmButtonText: 'Yes, delete it!',
                cancelButtonText: 'Cancel',
                background: 'rgba(255, 255, 255, 0.95)',
                backdrop: 'rgba(0,0,0,0.4)'
            });

            if (result.isConfirmed) {
                this.showLoading();
                console.log('🗑️ Deleting team:', teamId);
                
                const response = await fetch(`/api/teams/${teamId}`, {
                    method: 'DELETE'
                });

                const data = await response.json();
                this.hideLoading();

                if (data.success) {
                    await Swal.fire({
                        title: 'Deleted!',
                        text: 'Team has been deleted successfully.',
                        icon: 'success',
                        timer: 2000,
                        showConfirmButton: false,
                        background: 'rgba(255, 255, 255, 0.95)'
                    });
                    this.loadTeams();
                    this.loadDashboardData(); // Refresh dashboard
                } else {
                    this.showToast(data.error || 'Failed to delete team', 'error');
                }
            }
        } catch (error) {
            this.hideLoading();
            console.error('Delete team error:', error);
            this.showToast('Error deleting team', 'error');
        }
    }

    // Delete user method
    async deleteUser(userId, userName) {
        try {
            const result = await Swal.fire({
                title: 'Remove Team Member?',
                text: `This will permanently remove ${userName} from the team. This action cannot be undone!`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#dc3545',
                cancelButtonColor: '#6c757d',
                confirmButtonText: 'Yes, remove them!',
                cancelButtonText: 'Cancel',
                background: 'rgba(255, 255, 255, 0.95)',
                backdrop: 'rgba(0,0,0,0.4)'
            });

            if (result.isConfirmed) {
                this.showLoading();
                console.log('🗑️ Deleting user:', userId);
                
                const response = await fetch(`/api/users/${userId}`, {
                    method: 'DELETE'
                });

                const data = await response.json();
                this.hideLoading();

                if (data.success) {
                    await Swal.fire({
                        title: 'Removed!',
                        text: `${userName} has been removed from the team.`,
                        icon: 'success',
                        timer: 2000,
                        showConfirmButton: false,
                        background: 'rgba(255, 255, 255, 0.95)'
                    });
                    this.loadTeams();
                } else {
                    this.showToast(data.error || 'Failed to remove team member', 'error');
                }
            }
        } catch (error) {
            this.hideLoading();
            console.error('Delete user error:', error);
            this.showToast('Error removing team member', 'error');
        }
    }

    // Table Population Methods
    populateTeamsTable(teams) {
        if ($.fn.DataTable.isDataTable('#teamsTable')) {
            $('#teamsTable').DataTable().destroy();
        }

        const tbody = document.querySelector('#teamsTable tbody');
        tbody.innerHTML = '';

        teams.forEach((team, index) => {
            const row = tbody.insertRow();
            const usagePercentage = team.initial_amount > 0 ? (team.used_amount / team.initial_amount * 100) : 0;
            const statusColor = usagePercentage > 80 ? 'danger' : usagePercentage > 50 ? 'warning' : 'success';
            
            row.innerHTML = `
                <td>
                    <div class="d-flex align-items-center">
                        <div class="me-3">
                            <div class="avatar-circle bg-primary">
                                <i class="fas fa-users text-white"></i>
                            </div>
                        </div>
                        <div>
                            <strong class="text-gradient">${team.name}</strong><br>
                            <small class="text-muted">${team.description || 'No description'}</small>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="d-flex align-items-center">
                        <i class="fas fa-map-marker-alt text-primary me-2"></i>
                        <span class="fw-bold">${team.location}</span>
                    </div>
                </td>
                <td><span class="badge bg-success fs-6">$${parseFloat(team.initial_amount).toFixed(2)}</span></td>
                <td><span class="badge bg-warning fs-6">$${parseFloat(team.used_amount).toFixed(2)}</span></td>
                <td><span class="badge bg-info fs-6">$${parseFloat(team.remaining_amount).toFixed(2)}</span></td>
                <td>
                    <span class="badge bg-primary fs-6">${team.member_count}</span>
                    <div class="progress mt-1" style="height: 4px;">
                        <div class="progress-bar bg-${statusColor}" style="width: ${Math.min(usagePercentage, 100)}%"></div>
                    </div>
                </td>
                <td><small class="text-muted">${new Date(team.created_at).toLocaleDateString()}</small></td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-success hover-lift" onclick="app.showAddUserModal(${team.id})" title="Add Member">
                            <i class="fas fa-user-plus"></i>
                        </button>
                        <button class="btn btn-sm btn-info hover-lift" onclick="app.viewTeamDetails(${team.id})" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-danger hover-lift" onclick="app.deleteTeam(${team.id})" title="Delete Team">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            
            // Add staggered animation
            row.style.animationDelay = (index * 0.1) + 's';
            row.classList.add('animate-fade-in', 'hover-lift');
        });

        $('#teamsTable').DataTable({
            responsive: true,
            pageLength: 10,
            order: [[6, 'desc']],
            language: {
                emptyTable: "No teams created yet"
            },
            dom: '<"row"<"col-sm-12 col-md-6"l><"col-sm-12 col-md-6"f>>rtip'
        });
    }

    loadTeamsOverviewTable(teams) {
        const container = document.querySelector('#teamsOverviewTable').parentElement;
        
        if (teams.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5">
                    <i class="fas fa-users fa-3x text-muted mb-3"></i>
                    <h5 class="text-muted">No teams created yet</h5>
                    <p class="text-secondary">Create your first team to get started</p>
                </div>
            `;
            return;
        }

        // Create modern card layout similar to reference image
        const cardsHTML = teams.map((team, index) => {
            const usagePercentage = team.initial_amount > 0 ? (team.used_amount / team.initial_amount * 100) : 0;
            const remainingPercentage = 100 - usagePercentage;
            
            return `
                <div class="col-lg-4 col-md-6 mb-4" style="animation-delay: ${index * 0.1}s;">
                    <div class="card team-overview-card hover-lift animate-fade-in">
                        <div class="card-body p-4">
                            <div class="d-flex justify-content-between align-items-start mb-3">
                                <div>
                                    <h5 class="mb-1 fw-bold">${team.name}</h5>
                                    <div class="d-flex align-items-center text-muted">
                                        <i class="fas fa-map-marker-alt me-2"></i>
                                        <span>${team.location}</span>
                                    </div>
                                </div>
                                <div class="usage-badge">
                                    <span class="badge bg-success">${Math.round(usagePercentage)}%</span>
                                </div>
                            </div>
                            
                            <div class="budget-info mb-3">
                                <div class="d-flex justify-content-between mb-2">
                                    <span class="text-secondary">Budget:</span>
                                    <span class="fw-bold">$${parseFloat(team.initial_amount).toFixed(2)}</span>
                                </div>
                                <div class="d-flex justify-content-between mb-2">
                                    <span class="text-secondary">Spent:</span>
                                    <span class="fw-bold text-warning">$${parseFloat(team.used_amount).toFixed(2)}</span>
                                </div>
                                <div class="d-flex justify-content-between mb-3">
                                    <span class="text-secondary">Remaining:</span>
                                    <span class="fw-bold text-success">$${parseFloat(team.remaining_amount).toFixed(2)}</span>
                                </div>
                                
                                <div class="progress-container">
                                    <div class="progress" style="height: 8px;">
                                        <div class="progress-bar bg-success" style="width: ${remainingPercentage}%"></div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="d-flex justify-content-between align-items-center">
                                <div class="team-members">
                                    <i class="fas fa-users text-primary me-2"></i>
                                    <span class="text-secondary">${team.member_count} members</span>
                                </div>
                                <div class="action-buttons">
                                    <button class="btn btn-sm btn-outline-primary" onclick="app.viewTeamDetails(${team.id})" title="View Team">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline-success ms-1" onclick="app.showAddUserModal(${team.id})" title="Add Member">
                                        <i class="fas fa-user-plus"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="row">
                ${cardsHTML}
            </div>
        `;
    }

    loadRecentExpenses(expenses) {
        const container = document.getElementById('recentExpenses');
        
        if (expenses.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-3"><i class="fas fa-receipt fa-2x mb-2"></i><p>No recent expenses</p></div>';
            return;
        }

        container.innerHTML = expenses.map((expense, index) => `
            <div class="d-flex justify-content-between align-items-center mb-3 p-3 border rounded animate__animated animate__fadeInLeft" 
                 style="animation-delay: ${index * 0.1}s;">
                <div>
                    <div class="d-flex align-items-center mb-1">
                        <i class="fas fa-building text-primary me-2"></i>
                        <small class="text-muted">${expense.team_name}</small>
                    </div>
                    <strong>${expense.description}</strong><br>
                    <div class="d-flex align-items-center mt-1">
                        <i class="fas fa-user text-secondary me-1"></i>
                        <small>by ${expense.user_name}</small>
                    </div>
                </div>
                <div class="text-end">
                    <h5 class="text-success mb-1">$${parseFloat(expense.amount).toFixed(2)}</h5>
                    <small class="text-muted">${new Date(expense.created_at).toLocaleDateString()}</small>
                    ${expense.attachment_path ? '<br><i class="fas fa-paperclip text-info"></i>' : ''}
                </div>
            </div>
        `).join('');
    }

    loadMyExpensesTable(expenses) {
        if ($.fn.DataTable.isDataTable('#myExpensesTable')) {
            $('#myExpensesTable').DataTable().destroy();
        }

        const tbody = document.querySelector('#myExpensesTable tbody');
        tbody.innerHTML = '';

        expenses.forEach(expense => {
            const row = tbody.insertRow();
            row.innerHTML = `
                <td>${new Date(expense.created_at).toLocaleDateString()}</td>
                <td>
                    <strong>${expense.description}</strong><br>
                    <small class="text-muted">${expense.category || 'general'}</small>
                </td>
                <td><span class="badge bg-success">$${parseFloat(expense.amount).toFixed(2)}</span></td>
                <td>
                    ${expense.attachment_path ? 
                        `<a href="/api/download/${expense.attachment_path}" class="btn btn-sm btn-outline-primary" target="_blank" title="${expense.attachment_name}">
                            <i class="fas fa-download me-1"></i>View
                        </a>` : 
                        '<span class="text-muted">No attachment</span>'
                    }
                </td>
            `;
        });

        $('#myExpensesTable').DataTable({
            responsive: true,
            pageLength: 10,
            order: [[0, 'desc']],
            language: {
                emptyTable: "No expenses recorded yet"
            }
        });
    }

    populateExpensesTable(expenses) {
        if ($.fn.DataTable.isDataTable('#expensesTable')) {
            $('#expensesTable').DataTable().destroy();
        }

        const tbody = document.querySelector('#expensesTable tbody');
        tbody.innerHTML = '';

        expenses.forEach(expense => {
            const row = tbody.insertRow();
            row.innerHTML = `
                <td>${new Date(expense.created_at).toLocaleDateString()}</td>
                <td><span class="badge bg-primary">${expense.team_name}</span></td>
                <td><i class="fas fa-user me-1"></i>${expense.user_name}</td>
                <td>
                    <strong>${expense.description}</strong><br>
                    <small class="text-muted">${expense.category || 'general'}</small>
                </td>
                <td><span class="badge bg-success">$${parseFloat(expense.amount).toFixed(2)}</span></td>
                <td>
                    ${expense.attachment_path ? 
                        `<a href="/api/download/${expense.attachment_path}" class="btn btn-sm btn-outline-primary" target="_blank" title="${expense.attachment_name}">
                            <i class="fas fa-download me-1"></i>View
                        </a>` : 
                        '<span class="text-muted">No attachment</span>'
                    }
                </td>
            `;
        });

        $('#expensesTable').DataTable({
            responsive: true,
            pageLength: 10,
            order: [[0, 'desc']],
            language: {
                emptyTable: "No expenses recorded yet"
            }
        });
    }

    populateRequestsTable(requests) {
        if ($.fn.DataTable.isDataTable('#requestsTable')) {
            $('#requestsTable').DataTable().destroy();
        }

        const tbody = document.querySelector('#requestsTable tbody');
        tbody.innerHTML = '';

        requests.forEach(request => {
            const row = tbody.insertRow();
            const statusBadge = this.getStatusBadge(request.status);
            const actions = request.status === 'pending' && this.currentUser.role === 'admin' ? 
                `<button class="btn btn-sm btn-success me-1" onclick="app.approveRequest(${request.id})" title="Approve">
                    <i class="fas fa-check"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="app.rejectRequest(${request.id})" title="Reject">
                    <i class="fas fa-times"></i>
                </button>` : 
                '<span class="text-muted">-</span>';

            row.innerHTML = `
                <td>${new Date(request.created_at).toLocaleDateString()}</td>
                <td><span class="badge bg-primary">${request.team_name}</span></td>
                <td><i class="fas fa-user me-1"></i>${request.user_name}</td>
                <td><span class="badge bg-warning">$${parseFloat(request.requested_amount).toFixed(2)}</span></td>
                <td><small>${request.reason}</small></td>
                <td>${statusBadge}</td>
                <td>${actions}</td>
            `;
        });

        $('#requestsTable').DataTable({
            responsive: true,
            pageLength: 10,
            order: [[0, 'desc']],
            language: {
                emptyTable: "No requests submitted yet"
            }
        });
    }

    getStatusBadge(status) {
        const badges = {
            'pending': '<span class="badge bg-warning"><i class="fas fa-clock me-1"></i>Pending</span>',
            'approved': '<span class="badge bg-success"><i class="fas fa-check me-1"></i>Approved</span>',
            'rejected': '<span class="badge bg-danger"><i class="fas fa-times me-1"></i>Rejected</span>'
        };
        return badges[status] || status;
    }

    // Modal Methods
    showAddUserModal(teamId) {
        document.getElementById('userTeamId').value = teamId;
        new bootstrap.Modal(document.getElementById('addUserModal')).show();
    }

    async viewTeamDetails(teamId) {
        try {
            const response = await fetch(`/api/teams/${teamId}/members`);
            const members = await response.json();
            
            let membersList = members.length > 0 ? 
                members.map(member => `
                    <div class="member-card glass hover-lift">
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="d-flex align-items-center">
                                <div class="avatar-circle bg-success me-3">
                                    <i class="fas fa-user text-white"></i>
                                </div>
                                <div>
                                    <strong class="text-gradient">${member.full_name}</strong><br>
                                    <small class="text-muted">@${member.username}</small><br>
                                    <small class="text-info">${member.email || 'No email'}</small>
                                </div>
                            </div>
                            <div class="d-flex flex-column align-items-end">
                                <button class="btn btn-sm btn-danger hover-scale mb-2" onclick="app.deleteUser(${member.id}, '${member.full_name}')" title="Remove Member">
                                    <i class="fas fa-user-minus"></i>
                                </button>
                                <small class="text-muted">Joined: ${new Date(member.created_at).toLocaleDateString()}</small>
                            </div>
                        </div>
                    </div>
                `).join('') : 
                '<div class="text-center py-4"><i class="fas fa-users fa-3x text-muted mb-3"></i><p class="text-muted">No members assigned yet</p></div>';

            Swal.fire({
                title: '<span class="text-gradient">Team Members</span>',
                html: `<div style="max-height: 400px; overflow-y: auto;">${membersList}</div>`,
                width: 700,
                showCloseButton: true,
                showConfirmButton: false,
                background: 'rgba(255, 255, 255, 0.95)',
                backdrop: 'rgba(0,0,0,0.4)',
                customClass: {
                    container: 'animate-fade-in'
                }
            });
        } catch (error) {
            console.error('Error loading team details:', error);
            this.showToast('Error loading team details', 'error');
        }
    }

    // Event Binding
    bindEvents() {
        console.log('🔗 Binding events...');
        
        // Login form
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            this.login(username, password);
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.logout();
        });

        // Navigation
        document.getElementById('dashboardLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.showSection('dashboard');
        });

        const teamsLink = document.getElementById('teamsLink');
        if (teamsLink) {
            teamsLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showSection('teams');
            });
        }

        document.getElementById('expensesLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.showSection('expenses');
        });

        const requestsLink = document.getElementById('requestsLink');
        if (requestsLink) {
            requestsLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showSection('requests');
            });
        }

        // Create team form
        document.getElementById('createTeamForm').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const name = document.getElementById('createTeamName').value.trim();
            const location = document.getElementById('createTeamLocation').value.trim();
            const initialAmount = document.getElementById('initialAmount').value;
            const description = document.getElementById('createTeamDescription').value.trim();
            
            console.log('Form data:', { name, location, initialAmount, description });
            
            // Validate required fields
            if (!name) {
                this.showToast('Team name is required', 'error');
                return;
            }
            if (!location) {
                this.showToast('Location is required', 'error');
                return;
            }
            if (!initialAmount || isNaN(initialAmount) || parseFloat(initialAmount) < 0) {
                this.showToast('Valid initial amount is required', 'error');
                return;
            }
            
            const formData = {
                name: name,
                location: location,
                initial_amount: parseFloat(initialAmount),
                description: description
            };
            
            console.log('Sending team data:', formData);
            this.createTeam(formData);
        });

        // Add user form
        document.getElementById('addUserForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = {
                full_name: document.getElementById('userFullName').value,
                username: document.getElementById('userUsername').value,
                password: document.getElementById('userPassword').value,
                email: document.getElementById('userEmail').value,
                team_id: parseInt(document.getElementById('userTeamId').value)
            };
            this.addUserToTeam(formData);
        });

        // Add expense form
        document.getElementById('addExpenseForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData();
            formData.append('description', document.getElementById('expenseDescription').value);
            formData.append('amount', parseFloat(document.getElementById('expenseAmount').value));
            formData.append('category', document.getElementById('expenseCategory').value);
            
            const attachment = document.getElementById('expenseAttachment').files[0];
            if (attachment) {
                formData.append('attachment', attachment);
            }
            
            this.addExpense(formData);
        });

        // Request amount form
        document.getElementById('requestAmountForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = {
                requested_amount: parseFloat(document.getElementById('requestedAmount').value),
                reason: document.getElementById('requestReason').value
            };
            this.requestAmount(formData);
        });

        // Modal triggers
        document.querySelectorAll('.create-team-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                new bootstrap.Modal(document.getElementById('createTeamModal')).show();
            });
        });

        document.getElementById('addExpenseBtn').addEventListener('click', () => {
            new bootstrap.Modal(document.getElementById('addExpenseModal')).show();
        });

        document.getElementById('addExpenseBtn2').addEventListener('click', () => {
            new bootstrap.Modal(document.getElementById('addExpenseModal')).show();
        });

        document.getElementById('requestAmountBtn').addEventListener('click', () => {
            new bootstrap.Modal(document.getElementById('requestAmountModal')).show();
        });

        // File input preview
        document.getElementById('expenseAttachment').addEventListener('change', (e) => {
            const file = e.target.files[0];
            const preview = document.getElementById('filePreview');
            
            if (file) {
                preview.innerHTML = `
                    <div class="alert alert-info mt-2">
                        <i class="fas fa-file me-2"></i>
                        <strong>${file.name}</strong> (${(file.size / 1024 / 1024).toFixed(2)} MB)
                    </div>
                `;
            } else {
                preview.innerHTML = '';
            }
        });
    }

    // DataTables Initialization
    initializeDataTables() {
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

    // Utility Methods
    showLoading() {
        document.getElementById('loadingSpinner').classList.remove('d-none');
    }

    hideLoading() {
        document.getElementById('loadingSpinner').classList.add('d-none');
    }

    showToast(message, type = 'info') {
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
            timerProgressBar: true,
            background: type === 'success' ? '#d4edda' : 
                       type === 'error' ? '#f8d7da' : 
                       type === 'warning' ? '#fff3cd' : '#d1ecf1'
        });
    }

    animateCounter(elementId, finalValue) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        if (typeof finalValue === 'string' && finalValue.startsWith('$')) {
            const numValue = parseFloat(finalValue.replace('$', ''));
            let current = 0;
            const increment = numValue / 50;
            const timer = setInterval(() => {
                current += increment;
                if (current >= numValue) {
                    element.textContent = finalValue;
                    clearInterval(timer);
                } else {
                    element.textContent = '$' + current.toFixed(2);
                }
            }, 20);
        } else {
            element.textContent = finalValue;
            element.classList.add('animate__animated', 'animate__pulse');
        }
    }
}

// Initialize the application
const app = new FieldWorkBookApp();

// Global functions for onclick handlers
window.app = app;

console.log('✅ FieldWorkBook application loaded successfully!');