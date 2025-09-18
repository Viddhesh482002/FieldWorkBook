const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session configuration
app.use(session({
    secret: 'fieldworkbook-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        // Accept images only
        if (!file.originalname.match(/\.(jpg|JPG|jpeg|JPEG|png|PNG|gif|GIF|pdf|PDF)$/)) {
            req.fileValidationError = 'Only image and PDF files are allowed!';
            return cb(new Error('Only image and PDF files are allowed!'), false);
        }
        cb(null, true);
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Database initialization
const db = new sqlite3.Database('./fieldworkbook.db', (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to SQLite database');
    }
});

// Initialize database tables
db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'field_staff')),
        full_name TEXT NOT NULL,
        email TEXT,
        team_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (team_id) REFERENCES teams (id)
    )`);

    // Teams table
    db.run(`CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        location TEXT NOT NULL,
        initial_amount DECIMAL(10,2) DEFAULT 0,
        used_amount DECIMAL(10,2) DEFAULT 0,
        remaining_amount DECIMAL(10,2) DEFAULT 0,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Expenses table
    db.run(`CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        description TEXT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        category TEXT DEFAULT 'general',
        attachment_path TEXT,
        attachment_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (team_id) REFERENCES teams (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    // Amount requests table
    db.run(`CREATE TABLE IF NOT EXISTS amount_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        requested_amount DECIMAL(10,2) NOT NULL,
        reason TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME,
        processed_by INTEGER,
        FOREIGN KEY (team_id) REFERENCES teams (id),
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (processed_by) REFERENCES users (id)
    )`);

    // Create default admin user
    const adminPassword = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO users (username, password, role, full_name, email) 
            VALUES ('admin', ?, 'admin', 'System Administrator', 'admin@fieldworkbook.com')`, [adminPassword]);
    
    // Create sample team and field staff for demo
    db.run(`INSERT OR IGNORE INTO teams (name, location, initial_amount, remaining_amount, description) 
            VALUES ('New York Team', 'New York', 5000.00, 5000.00, 'Field operations team for New York region')`, [], function(err) {
        if (!err && this.lastID) {
            const fieldPassword = bcrypt.hashSync('field123', 10);
            db.run(`INSERT OR IGNORE INTO users (username, password, role, full_name, email, team_id) 
                    VALUES ('field1', ?, 'field_staff', 'John Smith', 'john@fieldworkbook.com', ?)`, 
                    [fieldPassword, this.lastID]);
        }
    });
});

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
};

const requireAdmin = (req, res, next) => {
    if (!req.session.userId || req.session.userRole !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// Authentication routes
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    console.log('Login attempt for:', username);

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (!user || !bcrypt.compareSync(password, user.password)) {
            console.log('Invalid credentials for:', username);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.session.userName = user.full_name;
        req.session.teamId = user.team_id;

        console.log('Login successful for:', user.username, 'Role:', user.role);

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                full_name: user.full_name,
                email: user.email,
                team_id: user.team_id
            }
        });
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Could not log out' });
        }
        res.json({ success: true });
    });
});

// Check authentication status
app.get('/api/auth/check', (req, res) => {
    if (req.session.userId) {
        res.json({
            authenticated: true,
            user: {
                id: req.session.userId,
                role: req.session.userRole,
                full_name: req.session.userName,
                team_id: req.session.teamId
            }
        });
    } else {
        res.json({ authenticated: false });
    }
});

// Team routes
app.get('/api/teams', requireAdmin, (req, res) => {
    db.all(`SELECT t.*, 
            (SELECT COUNT(*) FROM users WHERE team_id = t.id AND role = 'field_staff') as member_count
            FROM teams t ORDER BY t.created_at DESC`, (err, teams) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(teams);
    });
});

app.post('/api/teams', requireAdmin, (req, res) => {
    const { name, location, initial_amount, description } = req.body;
    
    console.log('Creating team with data:', { name, location, initial_amount, description });
    
    // Validate required fields
    if (!name || !location || initial_amount === undefined) {
        console.error('Missing required fields:', { name, location, initial_amount });
        return res.status(400).json({ error: 'Missing required fields: name, location, and initial_amount are required' });
    }
    
    const remaining_amount = parseFloat(initial_amount);
    const initial_amt = parseFloat(initial_amount);

    db.run(`INSERT INTO teams (name, location, initial_amount, remaining_amount, description) 
            VALUES (?, ?, ?, ?, ?)`, 
            [name, location, initial_amt, remaining_amount, description || ''], function(err) {
        if (err) {
            console.error('Database error creating team:', err);
            return res.status(500).json({ error: 'Failed to create team: ' + err.message });
        }
        console.log('Team created successfully with ID:', this.lastID);
        res.json({ success: true, id: this.lastID });
    });
});

app.get('/api/teams/:id', requireAuth, (req, res) => {
    const teamId = req.params.id;
    
    // Check if user has access to this team
    if (req.session.userRole === 'field_staff' && req.session.teamId != teamId) {
        return res.status(403).json({ error: 'Access denied to this team' });
    }
    
    db.get('SELECT * FROM teams WHERE id = ?', [teamId], (err, team) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }
        res.json(team);
    });
});

app.get('/api/teams/:id/members', requireAdmin, (req, res) => {
    const teamId = req.params.id;
    
    db.all(`SELECT id, username, full_name, email, created_at 
            FROM users WHERE team_id = ? AND role = 'field_staff'`, 
           [teamId], (err, members) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(members);
    });
});

// Delete team route
app.delete('/api/teams/:id', requireAdmin, (req, res) => {
    const teamId = req.params.id;
    
    console.log('Deleting team with ID:', teamId);
    
    // First, check if team has any expenses
    db.get('SELECT COUNT(*) as expense_count FROM expenses WHERE team_id = ?', [teamId], (err, result) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (result.expense_count > 0) {
            return res.status(400).json({ error: 'Cannot delete team with existing expenses. Please remove all expenses first.' });
        }
        
        // Delete team members first
        db.run('DELETE FROM users WHERE team_id = ?', [teamId], (err) => {
            if (err) {
                console.error('Database error deleting team members:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            // Delete amount requests
            db.run('DELETE FROM amount_requests WHERE team_id = ?', [teamId], (err) => {
                if (err) {
                    console.error('Database error deleting requests:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                
                // Finally delete the team
                db.run('DELETE FROM teams WHERE id = ?', [teamId], function(err) {
                    if (err) {
                        console.error('Database error deleting team:', err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    
                    if (this.changes === 0) {
                        return res.status(404).json({ error: 'Team not found' });
                    }
                    
                    console.log('Team deleted successfully:', teamId);
                    res.json({ success: true });
                });
            });
        });
    });
});

// User routes
app.post('/api/users', requireAdmin, (req, res) => {
    const { username, password, full_name, email, team_id } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);

    db.run(`INSERT INTO users (username, password, role, full_name, email, team_id) 
            VALUES (?, ?, 'field_staff', ?, ?, ?)`, 
            [username, hashedPassword, full_name, email || '', team_id], function(err) {
        if (err) {
            console.error('Database error:', err);
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: 'Username already exists' });
            }
            return res.status(500).json({ error: 'Database error' });
        }
        console.log('User created with ID:', this.lastID);
        res.json({ success: true, id: this.lastID });
    });
});

// Delete user route
app.delete('/api/users/:id', requireAdmin, (req, res) => {
    const userId = req.params.id;
    
    console.log('Deleting user with ID:', userId);
    
    // Check if user has any expenses
    db.get('SELECT COUNT(*) as expense_count FROM expenses WHERE user_id = ?', [userId], (err, result) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (result.expense_count > 0) {
            return res.status(400).json({ error: 'Cannot delete user with existing expenses. Please remove all expenses first.' });
        }
        
        // Delete amount requests first
        db.run('DELETE FROM amount_requests WHERE user_id = ?', [userId], (err) => {
            if (err) {
                console.error('Database error deleting requests:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            // Delete the user
            db.run('DELETE FROM users WHERE id = ? AND role = "field_staff"', [userId], function(err) {
                if (err) {
                    console.error('Database error deleting user:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                
                if (this.changes === 0) {
                    return res.status(404).json({ error: 'User not found or cannot delete admin users' });
                }
                
                console.log('User deleted successfully:', userId);
                res.json({ success: true });
            });
        });
    });
});

// Expense routes
app.get('/api/expenses', requireAuth, (req, res) => {
    let query = `SELECT e.*, u.full_name as user_name, t.name as team_name 
                 FROM expenses e 
                 JOIN users u ON e.user_id = u.id 
                 JOIN teams t ON e.team_id = t.id`;
    let params = [];

    if (req.session.userRole === 'field_staff') {
        query += ' WHERE e.team_id = ?';
        params.push(req.session.teamId);
    }

    query += ' ORDER BY e.created_at DESC';

    db.all(query, params, (err, expenses) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(expenses);
    });
});

app.post('/api/expenses', requireAuth, upload.single('attachment'), (req, res) => {
    const { description, amount, category } = req.body;
    const userId = req.session.userId;
    const teamId = req.session.teamId;
    const attachmentPath = req.file ? req.file.filename : null;
    const attachmentName = req.file ? req.file.originalname : null;

    if (req.session.userRole !== 'field_staff') {
        return res.status(403).json({ error: 'Only field staff can add expenses' });
    }

    if (!teamId) {
        return res.status(400).json({ error: 'You are not assigned to any team' });
    }

    // Check if team has sufficient balance
    db.get('SELECT remaining_amount FROM teams WHERE id = ?', [teamId], (err, team) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (!team || parseFloat(team.remaining_amount) < parseFloat(amount)) {
            return res.status(400).json({ error: 'Insufficient team balance' });
        }

        // Add expense
        db.run(`INSERT INTO expenses (team_id, user_id, description, amount, category, attachment_path, attachment_name) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`, 
                [teamId, userId, description, amount, category || 'general', attachmentPath, attachmentName], function(err) {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            // Update team amounts
            db.run(`UPDATE teams SET 
                    used_amount = used_amount + ?, 
                    remaining_amount = remaining_amount - ? 
                    WHERE id = ?`, 
                    [amount, amount, teamId], (err) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                console.log('Expense added with ID:', this.lastID);
                res.json({ success: true, id: this.lastID });
            });
        });
    });
});

// Amount request routes
app.get('/api/amount-requests', requireAuth, (req, res) => {
    let query = `SELECT ar.*, u.full_name as user_name, t.name as team_name,
                 p.full_name as processed_by_name
                 FROM amount_requests ar 
                 JOIN users u ON ar.user_id = u.id 
                 JOIN teams t ON ar.team_id = t.id
                 LEFT JOIN users p ON ar.processed_by = p.id`;
    let params = [];

    if (req.session.userRole === 'field_staff') {
        query += ' WHERE ar.team_id = ?';
        params.push(req.session.teamId);
    }

    query += ' ORDER BY ar.created_at DESC';

    db.all(query, params, (err, requests) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(requests);
    });
});

app.post('/api/amount-requests', requireAuth, (req, res) => {
    const { requested_amount, reason } = req.body;
    const userId = req.session.userId;
    const teamId = req.session.teamId;

    if (req.session.userRole !== 'field_staff') {
        return res.status(403).json({ error: 'Only field staff can request amounts' });
    }

    if (!teamId) {
        return res.status(400).json({ error: 'You are not assigned to any team' });
    }

    db.run(`INSERT INTO amount_requests (team_id, user_id, requested_amount, reason) 
            VALUES (?, ?, ?, ?)`, 
            [teamId, userId, requested_amount, reason], function(err) {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        console.log('Amount request created with ID:', this.lastID);
        res.json({ success: true, id: this.lastID });
    });
});

app.put('/api/amount-requests/:id/approve', requireAdmin, (req, res) => {
    const requestId = req.params.id;
    const adminId = req.session.userId;

    db.get('SELECT * FROM amount_requests WHERE id = ?', [requestId], (err, request) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (!request || request.status !== 'pending') {
            return res.status(400).json({ error: 'Invalid request' });
        }

        // Approve request and update team balance
        db.run(`UPDATE amount_requests SET status = 'approved', processed_at = CURRENT_TIMESTAMP, processed_by = ?
                WHERE id = ?`, [adminId, requestId], (err) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            // Update team amounts
            db.run(`UPDATE teams SET 
                    initial_amount = initial_amount + ?, 
                    remaining_amount = remaining_amount + ? 
                    WHERE id = ?`, 
                    [request.requested_amount, request.requested_amount, request.team_id], (err) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                console.log('Amount request approved:', requestId);
                res.json({ success: true });
            });
        });
    });
});

app.put('/api/amount-requests/:id/reject', requireAdmin, (req, res) => {
    const requestId = req.params.id;
    const adminId = req.session.userId;

    db.run(`UPDATE amount_requests SET status = 'rejected', processed_at = CURRENT_TIMESTAMP, processed_by = ?
            WHERE id = ?`, [adminId, requestId], function(err) {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        console.log('Amount request rejected:', requestId);
        res.json({ success: true });
    });
});

// Dashboard statistics
app.get('/api/dashboard/stats', requireAdmin, (req, res) => {
    const stats = {};
    
    // Get team count
    db.get('SELECT COUNT(*) as count FROM teams', (err, result) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        stats.totalTeams = result.count;
        
        // Get budget totals
        db.get('SELECT SUM(initial_amount) as total_budget, SUM(used_amount) as total_used, SUM(remaining_amount) as total_remaining FROM teams', (err, result) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            stats.totalBudget = result.total_budget || 0;
            stats.totalUsed = result.total_used || 0;
            stats.totalRemaining = result.total_remaining || 0;
            
            // Get pending requests count
            db.get('SELECT COUNT(*) as count FROM amount_requests WHERE status = "pending"', (err, result) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                stats.pendingRequests = result.count;
                
                res.json(stats);
            });
        });
    });
});

// File download route
app.get('/api/download/:filename', requireAuth, (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'uploads', filename);

    // Security check: verify file exists and user has access
    db.get('SELECT e.*, t.id as team_id FROM expenses e JOIN teams t ON e.team_id = t.id WHERE e.attachment_path = ?', 
           [filename], (err, expense) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!expense) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        // Check access permissions
        if (req.session.userRole === 'field_staff' && expense.team_id !== req.session.teamId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        if (fs.existsSync(filePath)) {
            res.download(filePath, expense.attachment_name || filename);
        } else {
            res.status(404).json({ error: 'File not found on server' });
        }
    });
});

// Serve static files
app.use('/uploads', express.static('uploads'));

// Serve main HTML file
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
        }
    }
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 FieldWorkBook server running on http://localhost:${PORT}`);
    console.log(`📋 Admin login: admin / admin123`);
    console.log(`👷 Field staff login: field1 / field123`);
    console.log(`📁 Database: fieldworkbook.db`);
    console.log(`📂 Uploads: ${uploadsDir}`);
});