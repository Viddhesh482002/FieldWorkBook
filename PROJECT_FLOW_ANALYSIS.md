# FieldWorkBook - Complete Project Flow Analysis

## 📋 Project Overview

**FieldWorkBook** is a web-based expense management system for field teams. It manages team budgets, tracks expenses, handles amount requests, and provides partner comparison reports. The system uses a three-tier role-based architecture: **Admin**, **Partner**, and **Field Staff**.

---

## 🏗️ Architecture Overview

### Technology Stack
- **Backend**: Node.js + Express.js
- **Database**: Supabase (PostgreSQL)
- **Frontend**: Vanilla JavaScript (ES6+), Bootstrap 5, HTML5/CSS3
- **File Storage**: Local filesystem (`uploads/` directory)
- **Session Management**: express-session
- **Authentication**: bcrypt for password hashing

### Project Structure
```
FieldWorkBook/
├── server.js              # Express server & API routes
├── package.json           # Dependencies
├── public/
│   ├── index.html        # Single-page application UI
│   ├── css/style.css     # Custom styling
│   └── js/app.js         # Frontend application logic (2463 lines)
├── uploads/               # Expense attachments storage
├── temp/                  # Temporary export files (Excel/PDF)
└── scripts/              # Utility scripts
```

---

## 🔄 Application Flow

### 1. Initialization Flow

```
Application Start
    ↓
FieldWorkBookApp.constructor()
    ↓
init() method called
    ├── checkAuthStatus()      # Check if user is logged in
    ├── bindEvents()            # Attach event listeners
    └── initializeDataTables() # Setup DataTables
```

**Key Methods:**
- `checkAuthStatus()`: Makes GET request to `/api/auth/check`
  - If authenticated → `showMainApp()` → Load dashboard
  - If not authenticated → `showLoginPage()`

---

### 2. Authentication Flow

#### Login Process
```
User enters credentials
    ↓
loginForm submit event
    ↓
login(username, password)
    ↓
POST /api/login
    ├── Query Supabase: users table (username match)
    ├── bcrypt.compareSync(password, user.password)
    ├── Create session:
    │   ├── req.session.userId = user.id
    │   ├── req.session.userRole = user.role
    │   ├── req.session.userName = user.full_name
    │   └── req.session.teamId = user.team_id
    └── Return user object
    ↓
Frontend receives user data
    ↓
showMainApp()
    ├── Hide login page
    ├── Show main content & navigation
    ├── Set role-based UI visibility
    └── Load dashboard
```

#### Role-Based Access Control

**Admin:**
- Full access to all features
- Can create/manage teams, partners, field staff
- Can approve/reject amount requests
- Can view partner reports

**Partner:**
- Same as Admin EXCEPT:
  - Cannot create/delete other partners
- Can create teams and assign budgets
- Can approve/reject requests
- Can view partner reports

**Field Staff:**
- Limited to own team
- Can add expenses
- Can request additional amounts
- Can view own expense history

#### Logout Process
```
User clicks logout
    ↓
POST /api/logout
    ├── req.session.destroy()
    └── Return success
    ↓
Frontend: showLoginPage()
```

---

### 3. Dashboard Flow

#### Admin/Partner Dashboard
```
loadAdminDashboard()
    ↓
Parallel API calls:
    ├── GET /api/dashboard/stats
    │   └── Returns: totalTeams, totalBudget, totalUsed, pendingRequests
    ├── GET /api/teams
    │   └── Returns: All teams with member counts
    └── GET /api/expenses
        └── Returns: Recent expenses (first 5)
    ↓
Update UI:
    ├── Animate counters (totalTeams, totalBudget, etc.)
    ├── Populate teams overview table
    └── Display recent expenses
```

#### Field Staff Dashboard
```
loadFieldStaffDashboard()
    ↓
GET /api/teams/:team_id
    └── Returns: Team details (name, location, amounts)
    ↓
Calculate budget usage:
    ├── usagePercentage = (used_amount / initial_amount) * 100
    └── Update progress bar
    ↓
GET /api/expenses
    └── Filter: expenses where user_id === currentUser.id
    ↓
Display:
    ├── Team information card
    ├── Budget progress bar
    └── Personal expense history table
```

---

### 4. Team Management Flow

#### Create Team (Admin/Partner)
```
User clicks "Create Team"
    ↓
Modal opens (createTeamModal)
    ↓
Form submission:
    ├── name, location, initial_amount, description
    └── created_by = req.session.userId (tracks partner/admin)
    ↓
POST /api/teams
    ├── Validate required fields
    ├── Insert into teams table:
    │   ├── initial_amount = requested amount
    │   ├── remaining_amount = initial_amount
    │   ├── used_amount = 0
    │   └── created_by = session userId
    └── Return team ID
    ↓
Frontend:
    ├── Show success toast
    ├── Refresh teams list
    └── Refresh dashboard stats
```

#### Add Team Member (Field Staff)
```
User clicks "+" button on team row
    ↓
Modal opens (addUserModal)
    ↓
Form submission:
    ├── full_name, username, password, email
    └── team_id (hidden field)
    ↓
POST /api/users
    ├── Hash password with bcrypt
    ├── Insert into users table:
    │   ├── role = 'field_staff'
    │   └── team_id = selected team
    └── Return user ID
    ↓
Frontend: Refresh teams table
```

#### View Team Members
```
User clicks team name or info icon
    ↓
GET /api/teams/:id/members
    └── Returns: All field_staff users for that team
    ↓
Display in SweetAlert2 modal
```

#### Delete Team
```
User clicks delete button
    ↓
Confirmation dialog
    ↓
DELETE /api/teams/:id
    ├── Check if team has expenses
    │   └── If yes: Return error (cannot delete)
    ├── Delete team members (users where team_id = teamId)
    ├── Delete amount requests (where team_id = teamId)
    └── Delete team
    ↓
Frontend: Refresh teams list
```

---

### 5. Expense Management Flow

#### Add Expense (Field Staff Only)
```
User clicks "Add Expense" button
    ↓
Modal opens (addExpenseModal)
    ↓
Form submission with FormData:
    ├── description, amount, category
    └── attachment (file upload)
    ↓
POST /api/expenses (with multer middleware)
    ├── Validate: Only field_staff can add expenses
    ├── Validate: User has team_id
    ├── Check team balance:
    │   └── If remaining_amount < amount: Return error
    ├── Upload file (if provided):
    │   ├── Save to uploads/ directory
    │   ├── Generate unique filename
    │   └── Store: attachment_path, attachment_name
    ├── Insert expense into expenses table
    └── Update team amounts:
        ├── Try: supabase.rpc('increment_team_usage')
        └── Fallback: Manual update
            ├── used_amount += amount
            └── remaining_amount -= amount
    ↓
Frontend:
    ├── Show success toast
    ├── Refresh expenses table
    └── Refresh dashboard (update team balance)
```

#### View Expenses
```
loadExpenses()
    ↓
GET /api/expenses
    ├── If field_staff: Filter by team_id
    └── If admin/partner: Return all expenses
    ↓
Enrich data:
    ├── Fetch user names (for user_id)
    └── Fetch team names (for team_id)
    ↓
Populate DataTable with:
    ├── Date, Team, User, Description, Amount
    └── Attachment (download link)
```

#### Download Attachment
```
User clicks attachment link
    ↓
GET /api/download/:filename
    ├── Query expenses table (find expense with attachment_path)
    ├── Check access:
    │   └── If field_staff: Verify expense.team_id === session.teamId
    ├── Verify file exists
    └── res.download(filePath, attachment_name)
```

---

### 6. Amount Request Flow

#### Create Request (Field Staff)
```
User clicks "Request Additional Amount"
    ↓
Modal opens (requestAmountModal)
    ↓
Form submission:
    ├── requested_amount
    └── reason
    ↓
POST /api/amount-requests
    ├── Validate: Only field_staff can request
    ├── Validate: User has team_id
    └── Insert into amount_requests table:
        ├── status = 'pending'
        ├── team_id, user_id
        └── created_at = now()
    ↓
Frontend: Show success toast
```

#### View Requests (Admin/Partner)
```
loadAmountRequests()
    ↓
GET /api/amount-requests
    ├── If field_staff: Filter by team_id
    └── If admin/partner: Return all requests
    ↓
Enrich data:
    ├── Fetch user names
    ├── Fetch team names
    └── Fetch processed_by names
    ↓
Populate DataTable with status badges
```

#### Approve Request (Admin/Partner)
```
User clicks "Approve" button
    ↓
PUT /api/amount-requests/:id/approve
    ├── Validate: Request status is 'pending'
    ├── Update request:
    │   ├── status = 'approved'
    │   ├── processed_by = session.userId
    │   └── processed_at = now()
    └── Update team amounts:
        ├── initial_amount += requested_amount
        └── remaining_amount += requested_amount
    ↓
Frontend: Refresh requests table & dashboard
```

#### Reject Request (Admin/Partner)
```
User clicks "Reject" button
    ↓
PUT /api/amount-requests/:id/reject
    ├── Update request:
    │   ├── status = 'rejected'
    │   ├── processed_by = session.userId
    │   └── processed_at = now()
    └── No team amount changes
    ↓
Frontend: Refresh requests table
```

---

### 7. Partner Management Flow

#### Create Partner (Admin Only)
```
Admin navigates to Partners section
    ↓
Clicks "Create Partner" button
    ↓
Modal opens (createPartnerModal)
    ↓
Form submission:
    ├── full_name, username, password, email
    └── team_id (optional)
    ↓
POST /api/partners
    ├── Validate: Only admin can create partners
    ├── Hash password
    └── Insert into users table:
        └── role = 'partner'
    ↓
Frontend: Refresh partners table
```

#### View Partners
```
loadPartners()
    ↓
GET /api/partners
    └── Returns: All users where role = 'partner'
    ↓
Enrich with team names
    ↓
Populate DataTable
```

#### Delete Partner (Admin Only)
```
User clicks delete button
    ↓
DELETE /api/partners/:id
    ├── Check if partner has expenses
    ├── Delete amount requests
    └── Delete partner user
```

---

### 8. Partner Report Flow

#### Generate Report
```
User navigates to Partner Reports section
    ↓
Select filters:
    ├── Partner 1 (dropdown)
    ├── Partner 2 (dropdown)
    ├── From Date (optional)
    ├── To Date (optional)
    └── Team (optional)
    ↓
Click "Generate Report"
    ↓
GET /api/partner-report?partner1_id=X&partner2_id=Y&from_date=...&to_date=...
    ├── Fetch teams created by both partners:
    │   └── WHERE created_by IN (partner1_id, partner2_id)
    ├── Fetch approved requests:
    │   └── WHERE processed_by IN (partner1_id, partner2_id) AND status = 'approved'
    ├── Apply date filters (if provided)
    └── Transform data:
        ├── Team creations → partner1_amount or partner2_amount
        └── Request approvals → partner1_amount or partner2_amount
    ↓
Calculate totals:
    ├── partner1_total = sum of partner1_amount
    ├── partner2_total = sum of partner2_amount
    └── total_difference = partner1_total - partner2_total
    ↓
Frontend:
    ├── Display summary tiles
    ├── Populate report table
    └── Show export buttons
```

#### Export to Excel
```
User clicks "Export to Excel"
    ↓
POST /api/partner-report/export/excel
    ├── Receive report data in request body
    ├── Create ExcelJS workbook
    ├── Add worksheet with:
    │   ├── Title & partner names
    │   ├── Summary row
    │   ├── Headers
    │   ├── Data rows
    │   └── Totals row
    ├── Save to temp/ directory
    └── Return file URL
    ↓
Frontend:
    ├── Open download URL
    └── File auto-downloads
    ↓
Server: Delete temp file after 5 seconds
```

#### Export to PDF
```
User clicks "Export to PDF"
    ↓
POST /api/partner-report/export/pdf
    ├── Receive report data in request body
    ├── Create PDFDocument
    ├── Add content:
    │   ├── Title & partner names
    │   ├── Summary boxes
    │   ├── Table headers
    │   └── Data rows (limited to 30)
    ├── Save to temp/ directory
    └── Return file URL
    ↓
Frontend: Download PDF
```

---

## 🗄️ Database Schema & Relationships

### Tables

**users**
- `id` (BIGINT, PK)
- `username` (UNIQUE)
- `password` (HASHED)
- `role` ('admin', 'partner', 'field_staff')
- `full_name`
- `email`
- `team_id` (FK → teams.id, nullable)
- `created_at`

**teams**
- `id` (BIGINT, PK)
- `name`
- `location`
- `initial_amount` (DECIMAL)
- `used_amount` (DECIMAL)
- `remaining_amount` (DECIMAL)
- `created_by` (FK → users.id, tracks partner/admin)
- `description`
- `created_at`

**expenses**
- `id` (BIGINT, PK)
- `team_id` (FK → teams.id)
- `user_id` (FK → users.id)
- `description`
- `amount` (DECIMAL)
- `category` ('general', 'food', 'transport', etc.)
- `attachment_path` (filename)
- `attachment_name` (original filename)
- `created_at`

**amount_requests**
- `id` (BIGINT, PK)
- `team_id` (FK → teams.id)
- `user_id` (FK → users.id)
- `requested_amount` (DECIMAL)
- `reason` (TEXT)
- `status` ('pending', 'approved', 'rejected')
- `processed_by` (FK → users.id, nullable)
- `created_at`
- `processed_at` (nullable)

### Relationships
```
users (1) ──→ (N) teams (via created_by)
users (1) ──→ (N) teams (via team_id, for field_staff)
teams (1) ──→ (N) expenses
users (1) ──→ (N) expenses
teams (1) ──→ (N) amount_requests
users (1) ──→ (N) amount_requests (as requester)
users (1) ──→ (N) amount_requests (as processor)
```

---

## 🔐 Security Features

1. **Password Hashing**: bcrypt with salt rounds
2. **Session Management**: express-session with secure cookies
3. **Role-Based Access Control**: Middleware checks (`requireAuth`, `requireAdmin`, `requireAdminOrPartner`)
4. **File Upload Validation**: 
   - File type checking (images/PDF only)
   - File size limit (5MB)
   - Unique filename generation
5. **SQL Injection Prevention**: Supabase client handles parameterized queries
6. **Access Control**: Users can only access their own team's data (field_staff)

---

## 📊 Data Flow Summary

### Budget Flow
```
1. Admin/Partner creates team → initial_amount set
2. Field staff adds expense → remaining_amount decreases
3. Field staff requests more → amount_requests table
4. Admin/Partner approves → remaining_amount increases
```

### Partner Tracking Flow
```
1. Partner creates team → teams.created_by = partner_id
2. Partner approves request → amount_requests.processed_by = partner_id
3. Report queries → Compare allocations by created_by & processed_by
```

### Expense Flow
```
1. Field staff submits expense form
2. File uploaded to uploads/ directory
3. Expense inserted into database
4. Team balance updated atomically
5. Dashboard refreshes to show new balance
```

---

## 🎨 Frontend Architecture

### Class Structure
```javascript
class FieldWorkBookApp {
    constructor()
    init()
    
    // Authentication
    checkAuthStatus()
    login()
    logout()
    
    // UI Management
    showLoginPage()
    showMainApp()
    showSection()
    
    // Data Loading
    loadDashboardData()
    loadAdminDashboard()
    loadFieldStaffDashboard()
    loadSectionData()
    
    // CRUD Operations
    createTeam()
    addExpense()
    requestAmount()
    approveRequest()
    rejectRequest()
    
    // UI Helpers
    showToast()
    showLoading()
    animateCounter()
}
```

### Event Binding Flow
```
bindEvents() called on init
    ├── Form submissions (login, create team, add expense, etc.)
    ├── Navigation clicks (dashboard, teams, expenses, etc.)
    ├── Button clicks (approve, reject, delete, etc.)
    └── Modal triggers
```

---

## 🔄 State Management

### Current State Variables
- `currentUser`: User object (id, role, team_id, etc.)
- `currentSection`: Active section name ('dashboard', 'teams', etc.)

### Session State (Backend)
- `req.session.userId`
- `req.session.userRole`
- `req.session.userName`
- `req.session.teamId`

---

## 🚨 Error Handling

### Frontend
- Try-catch blocks around async operations
- Toast notifications for errors
- Loading indicators during operations
- Form validation before submission

### Backend
- Database error logging
- HTTP status codes (400, 401, 403, 500)
- Error messages in JSON responses
- File upload error handling

---

## 📁 File Management

### Upload Flow
```
User selects file
    ↓
Multer middleware processes
    ├── Validates file type
    ├── Validates file size
    ├── Generates unique filename: attachment-{timestamp}-{random}.{ext}
    └── Saves to uploads/ directory
    ↓
Filename stored in database
```

### Download Flow
```
User clicks attachment link
    ↓
GET /api/download/:filename
    ├── Query database for expense
    ├── Verify user access
    └── Stream file to client
```

### Export Files
```
Report generated
    ↓
Excel/PDF created in temp/ directory
    ↓
File URL returned to frontend
    ↓
File downloaded
    ↓
Server deletes temp file after 5 seconds
```

---

## 🎯 Key Business Logic

### Team Balance Calculation
```javascript
// On expense creation:
remaining_amount = remaining_amount - expense.amount
used_amount = used_amount + expense.amount

// On request approval:
initial_amount = initial_amount + requested_amount
remaining_amount = remaining_amount + requested_amount
```

### Partner Report Calculation
```javascript
// For each team creation:
if (team.created_by === partner1_id) {
    partner1_amount += team.initial_amount
}
if (team.created_by === partner2_id) {
    partner2_amount += team.initial_amount
}

// For each approved request:
if (request.processed_by === partner1_id) {
    partner1_amount += request.requested_amount
}
if (request.processed_by === partner2_id) {
    partner2_amount += request.requested_amount
}
```

---

## 🔍 Important Code Patterns

### 1. Role-Based UI Visibility
```javascript
if (user.role === 'admin' || user.role === 'partner') {
    adminElements.forEach(el => el.style.display = 'block')
} else {
    fieldStaffElements.forEach(el => el.style.display = 'block')
}
```

### 2. Data Enrichment Pattern
```javascript
// Fetch related data
const userIds = [...new Set(expenses.map(e => e.user_id))]
const { data: users } = await supabase.from('users').select('id, full_name').in('id', userIds)

// Create map
const usersMap = new Map(users.map(u => [u.id, u.full_name]))

// Enrich original data
const enriched = expenses.map(e => ({
    ...e,
    user_name: usersMap.get(e.user_id) || 'Unknown'
}))
```

### 3. Atomic Balance Updates
```javascript
// Try RPC function first
const { error } = await supabase.rpc('increment_team_usage', { p_team_id, p_amount })

// Fallback to manual update
if (error) {
    const { data: team } = await supabase.from('teams').select('used_amount, remaining_amount').eq('id', teamId).single()
    const used_amount_next = parseFloat(team.used_amount) + parseFloat(amount)
    const remaining_amount_next = parseFloat(team.remaining_amount) - parseFloat(amount)
    await supabase.from('teams').update({ used_amount: used_amount_next, remaining_amount: remaining_amount_next }).eq('id', teamId)
}
```

---

## 📝 Summary

FieldWorkBook is a comprehensive expense management system with:

1. **Three-tier role system** (Admin, Partner, Field Staff)
2. **Team-based budget management** with real-time balance tracking
3. **Expense tracking** with file attachments
4. **Request/approval workflow** for additional funding
5. **Partner comparison reports** with Excel/PDF export
6. **Modern, responsive UI** with smooth animations
7. **Secure authentication** and role-based access control
8. **RESTful API** with proper error handling

The application follows a clean separation of concerns with the frontend handling UI/UX and the backend managing business logic, database operations, and file handling.

