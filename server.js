const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcrypt');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

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

// Supabase client
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    console.warn('Supabase env vars not set. Please configure SUPABASE_URL and SUPABASE_SERVICE_ROLE in .env');
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false }
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
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    console.log('Login attempt for:', username);

    const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .limit(1);
    if (error) {
        console.error('Database error:', error);
            return res.status(500).json({ error: 'Database error' });
        }
    const user = users && users.length > 0 ? users[0] : null;
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
app.get('/api/teams', requireAdmin, async (req, res) => {
    const { data: teams, error } = await supabase
        .from('teams')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) {
        console.error('Database error:', error);
        return res.status(500).json({ error: 'Database error' });
    }
    // compute member_count
    const teamIds = (teams || []).map(t => t.id);
    let memberCounts = {};
    if (teamIds.length > 0) {
        const { data: members, error: membersErr } = await supabase
            .from('users')
            .select('id, team_id')
            .in('team_id', teamIds)
            .eq('role', 'field_staff');
        if (membersErr) {
            console.error('Database error:', membersErr);
            return res.status(500).json({ error: 'Database error' });
        }
        members.forEach(m => {
            memberCounts[m.team_id] = (memberCounts[m.team_id] || 0) + 1;
    });
    }
    const withCounts = (teams || []).map(t => ({ ...t, member_count: memberCounts[t.id] || 0 }));
    res.json(withCounts);
});

app.post('/api/teams', requireAdmin, async (req, res) => {
    const { name, location, initial_amount, description } = req.body;
    
    console.log('Creating team with data:', { name, location, initial_amount, description });
    
    // Validate required fields
    if (!name || !location || initial_amount === undefined) {
        console.error('Missing required fields:', { name, location, initial_amount });
        return res.status(400).json({ error: 'Missing required fields: name, location, and initial_amount are required' });
    }
    
    const remaining_amount = parseFloat(initial_amount);
    const initial_amt = parseFloat(initial_amount);

    const { data, error } = await supabase
        .from('teams')
        .insert([{ name, location, initial_amount: initial_amt, remaining_amount, description: description || '', created_at: new Date().toISOString() }])
        .select('id')
        .single();
    if (error) {
        console.error('Database error creating team:', error);
        return res.status(500).json({ error: 'Failed to create team: ' + error.message });
    }
    console.log('Team created successfully with ID:', data.id);
    res.json({ success: true, id: data.id });
});

app.get('/api/teams/:id', requireAuth, async (req, res) => {
    const teamId = req.params.id;
    
    // Check if user has access to this team
    if (req.session.userRole === 'field_staff' && req.session.teamId != teamId) {
        return res.status(403).json({ error: 'Access denied to this team' });
    }
    
    const { data: team, error } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single();
    if (error) {
        console.error('Database error:', error);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }
        res.json(team);
});

app.get('/api/teams/:id/members', requireAdmin, async (req, res) => {
    const teamId = req.params.id;
    const { data: members, error } = await supabase
        .from('users')
        .select('id, username, full_name, email, created_at')
        .eq('team_id', teamId)
        .eq('role', 'field_staff');
    if (error) {
        console.error('Database error:', error);
            return res.status(500).json({ error: 'Database error' });
        }
    res.json(members || []);
});

// Delete team route
app.delete('/api/teams/:id', requireAdmin, async (req, res) => {
    const teamId = req.params.id;
    
    console.log('Deleting team with ID:', teamId);
    
    // First, check if team has any expenses
    const { count: expenseCount, error: expenseCountErr } = await supabase
        .from('expenses')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId);
    if (expenseCountErr) {
        console.error('Database error:', expenseCountErr);
            return res.status(500).json({ error: 'Database error' });
        }
    if ((expenseCount || 0) > 0) {
            return res.status(400).json({ error: 'Cannot delete team with existing expenses. Please remove all expenses first.' });
        }
        
    // Delete team members
    const { error: delUsersErr } = await supabase
        .from('users')
        .delete()
        .eq('team_id', teamId);
    if (delUsersErr) {
        console.error('Database error deleting team members:', delUsersErr);
                return res.status(500).json({ error: 'Database error' });
            }
            
            // Delete amount requests
    const { error: delReqErr } = await supabase
        .from('amount_requests')
        .delete()
        .eq('team_id', teamId);
    if (delReqErr) {
        console.error('Database error deleting requests:', delReqErr);
                    return res.status(500).json({ error: 'Database error' });
                }
                
    // Delete the team
    const { error: delTeamErr } = await supabase
        .from('teams')
        .delete()
        .eq('id', teamId);
    if (delTeamErr) {
        console.error('Database error deleting team:', delTeamErr);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    console.log('Team deleted successfully:', teamId);
                    res.json({ success: true });
});

// User routes
app.post('/api/users', requireAdmin, async (req, res) => {
    const { username, password, full_name, email, team_id } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);
    const { data, error } = await supabase
        .from('users')
        .insert([{ username, password: hashedPassword, role: 'field_staff', full_name, email: email || '', team_id, created_at: new Date().toISOString() }])
        .select('id')
        .single();
    if (error) {
        console.error('Database error:', error);
        if (error.message && error.message.toLowerCase().includes('duplicate')) {
                return res.status(400).json({ error: 'Username already exists' });
            }
            return res.status(500).json({ error: 'Database error' });
        }
    console.log('User created with ID:', data.id);
    res.json({ success: true, id: data.id });
});

// Delete user route
app.delete('/api/users/:id', requireAdmin, async (req, res) => {
    const userId = req.params.id;
    
    console.log('Deleting user with ID:', userId);
    
    // Check if user has any expenses
    const { count: userExpenseCount, error: expCntErr } = await supabase
        .from('expenses')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
    if (expCntErr) {
        console.error('Database error:', expCntErr);
            return res.status(500).json({ error: 'Database error' });
        }
    if ((userExpenseCount || 0) > 0) {
            return res.status(400).json({ error: 'Cannot delete user with existing expenses. Please remove all expenses first.' });
        }
        
    // Delete amount requests
    const { error: delReqsErr } = await supabase
        .from('amount_requests')
        .delete()
        .eq('user_id', userId);
    if (delReqsErr) {
        console.error('Database error deleting requests:', delReqsErr);
                return res.status(500).json({ error: 'Database error' });
            }
    // Delete the user (only field_staff)
    const { data: userData, error: getUserErr } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();
    if (getUserErr) {
        console.error('Database error:', getUserErr);
                    return res.status(500).json({ error: 'Database error' });
                }
    if (!userData || userData.role !== 'field_staff') {
                    return res.status(404).json({ error: 'User not found or cannot delete admin users' });
                }
    const { error: delUserErr } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);
    if (delUserErr) {
        console.error('Database error deleting user:', delUserErr);
        return res.status(500).json({ error: 'Database error' });
    }
                console.log('User deleted successfully:', userId);
                res.json({ success: true });
});

// Expense routes
app.get('/api/expenses', requireAuth, async (req, res) => {
    let query = supabase.from('expenses').select('*').order('created_at', { ascending: false });
    if (req.session.userRole === 'field_staff') {
        query = query.eq('team_id', req.session.teamId);
    }
    const { data: expenses, error } = await query;
    if (error) {
        console.error('Database error:', error);
            return res.status(500).json({ error: 'Database error' });
        }
    // Enrich with user_name and team_name
    const userIds = [...new Set((expenses || []).map(e => e.user_id))];
    const teamIds = [...new Set((expenses || []).map(e => e.team_id))];
    const [{ data: users }, { data: teams }] = await Promise.all([
        userIds.length ? supabase.from('users').select('id, full_name').in('id', userIds) : Promise.resolve({ data: [] }),
        teamIds.length ? supabase.from('teams').select('id, name').in('id', teamIds) : Promise.resolve({ data: [] })
    ]);
    const usersMap = new Map((users || []).map(u => [u.id, u.full_name]));
    const teamsMap = new Map((teams || []).map(t => [t.id, t.name]));
    const enriched = (expenses || []).map(e => ({
        ...e,
        user_name: usersMap.get(e.user_id) || 'Unknown',
        team_name: teamsMap.get(e.team_id) || 'Unknown'
    }));
    res.json(enriched);
});

app.post('/api/expenses', requireAuth, upload.single('attachment'), async (req, res) => {
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
    const { data: team, error: teamErr } = await supabase
        .from('teams')
        .select('remaining_amount')
        .eq('id', teamId)
        .single();
    if (teamErr) {
        console.error('Database error:', teamErr);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!team || parseFloat(team.remaining_amount) < parseFloat(amount)) {
            return res.status(400).json({ error: 'Insufficient team balance' });
        }

        // Add expense
    const { data: newExpense, error: insertErr } = await supabase
        .from('expenses')
        .insert([{ team_id: teamId, user_id: userId, description, amount, category: category || 'general', attachment_path: attachmentPath, attachment_name: attachmentName, created_at: new Date().toISOString() }])
        .select('id')
        .single();
    if (insertErr) {
        console.error('Database error:', insertErr);
                return res.status(500).json({ error: 'Database error' });
            }

            // Update team amounts
    const { error: updateErr } = await supabase.rpc('increment_team_usage', {
        p_team_id: teamId,
        p_amount: parseFloat(amount)
    });
    // Fallback if RPC not present
    if (updateErr) {
        // If RPC isn't defined, do manual two-step update
        const { data: teamNow, error: getTeamErr } = await supabase
            .from('teams')
            .select('used_amount, remaining_amount')
            .eq('id', teamId)
            .single();
        if (getTeamErr) {
            console.error('Database error:', getTeamErr);
            return res.status(500).json({ error: 'Database error' });
        }
        const used_amount_next = parseFloat(teamNow.used_amount || 0) + parseFloat(amount);
        const remaining_amount_next = parseFloat(teamNow.remaining_amount || 0) - parseFloat(amount);
        const { error: finalUpdErr } = await supabase
            .from('teams')
            .update({ used_amount: used_amount_next, remaining_amount: remaining_amount_next })
            .eq('id', teamId);
        if (finalUpdErr) {
            console.error('Database error:', finalUpdErr);
            return res.status(500).json({ error: 'Database error' });
        }
    }

    console.log('Expense added with ID:', newExpense.id);
    res.json({ success: true, id: newExpense.id });
});

// Amount request routes
app.get('/api/amount-requests', requireAuth, async (req, res) => {
    let query = supabase.from('amount_requests').select('*').order('created_at', { ascending: false });
    if (req.session.userRole === 'field_staff') {
        query = query.eq('team_id', req.session.teamId);
    }
    const { data: requests, error } = await query;
    if (error) {
        console.error('Database error:', error);
            return res.status(500).json({ error: 'Database error' });
        }
    // Enrich names
    const userIds = [...new Set((requests || []).map(r => r.user_id).concat((requests || []).map(r => r.processed_by).filter(Boolean)))];
    const teamIds = [...new Set((requests || []).map(r => r.team_id))];
    const [{ data: users }, { data: teams }] = await Promise.all([
        userIds.length ? supabase.from('users').select('id, full_name').in('id', userIds) : Promise.resolve({ data: [] }),
        teamIds.length ? supabase.from('teams').select('id, name').in('id', teamIds) : Promise.resolve({ data: [] })
    ]);
    const usersMap = new Map((users || []).map(u => [u.id, u.full_name]));
    const teamsMap = new Map((teams || []).map(t => [t.id, t.name]));
    const enriched = (requests || []).map(r => ({
        ...r,
        user_name: usersMap.get(r.user_id) || 'Unknown',
        team_name: teamsMap.get(r.team_id) || 'Unknown',
        processed_by_name: r.processed_by ? (usersMap.get(r.processed_by) || 'Unknown') : null
    }));
    res.json(enriched);
});

app.post('/api/amount-requests', requireAuth, async (req, res) => {
    const { requested_amount, reason } = req.body;
    const userId = req.session.userId;
    const teamId = req.session.teamId;

    if (req.session.userRole !== 'field_staff') {
        return res.status(403).json({ error: 'Only field staff can request amounts' });
    }

    if (!teamId) {
        return res.status(400).json({ error: 'You are not assigned to any team' });
    }

    const { data, error } = await supabase
        .from('amount_requests')
        .insert([{ team_id: teamId, user_id: userId, requested_amount, reason, status: 'pending', created_at: new Date().toISOString() }])
        .select('id')
        .single();
    if (error) {
        console.error('Database error:', error);
            return res.status(500).json({ error: 'Database error' });
        }
    console.log('Amount request created with ID:', data.id);
    res.json({ success: true, id: data.id });
});

app.put('/api/amount-requests/:id/approve', requireAdmin, async (req, res) => {
    const requestId = req.params.id;
    const adminId = req.session.userId;
	const { data: request, error: getReqErr } = await supabase
		.from('amount_requests')
		.select('*')
		.eq('id', requestId)
		.single();
	if (getReqErr) {
		console.error('Database error:', getReqErr);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!request || (request.status !== 'pending' && request.status !== null)) {
            return res.status(400).json({ error: 'Invalid request or request already processed' });
        }

	const { error: updReqErr } = await supabase
		.from('amount_requests')
		.update({ status: 'approved', processed_at: new Date().toISOString(), processed_by: adminId })
		.eq('id', requestId);
	if (updReqErr) {
		console.error('Database error:', updReqErr);
                return res.status(500).json({ error: 'Database error' });
            }

            // Update team amounts
	const { data: teamNow, error: teamNowErr } = await supabase
		.from('teams')
		.select('initial_amount, remaining_amount')
		.eq('id', request.team_id)
		.single();
	if (teamNowErr) {
		console.error('Database error:', teamNowErr);
		return res.status(500).json({ error: 'Database error' });
	}
	const initial_amount_next = parseFloat(teamNow.initial_amount || 0) + parseFloat(request.requested_amount);
	const remaining_amount_next = parseFloat(teamNow.remaining_amount || 0) + parseFloat(request.requested_amount);
	const { error: updTeamErr } = await supabase
		.from('teams')
		.update({ initial_amount: initial_amount_next, remaining_amount: remaining_amount_next })
		.eq('id', request.team_id);
	if (updTeamErr) {
		console.error('Database error:', updTeamErr);
                    return res.status(500).json({ error: 'Database error' });
                }
                console.log('Amount request approved:', requestId);
                res.json({ success: true });
});

app.put('/api/amount-requests/:id/reject', requireAdmin, async (req, res) => {
    const requestId = req.params.id;
    const adminId = req.session.userId;

	const { error } = await supabase
		.from('amount_requests')
		.update({ status: 'rejected', processed_at: new Date().toISOString(), processed_by: adminId })
		.eq('id', requestId);
	if (error) {
		console.error('Database error:', error);
            return res.status(500).json({ error: 'Database error' });
        }
        console.log('Amount request rejected:', requestId);
        res.json({ success: true });
});

// Fix existing null status requests (admin only)
app.put('/api/fix-null-requests', requireAdmin, async (req, res) => {
    try {
        const { error } = await supabase
            .from('amount_requests')
            .update({ status: 'pending' })
            .is('status', null);
        
        if (error) {
            console.error('Database error fixing null status:', error);
            return res.status(500).json({ error: 'Database error' });
        }
        
        console.log('Fixed null status requests');
        res.json({ success: true });
    } catch (error) {
        console.error('Error fixing null requests:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Fix existing null/invalid dates (admin only)
app.put('/api/fix-null-dates', requireAdmin, async (req, res) => {
    try {
        const currentTime = new Date().toISOString();
        
        // Fix expenses with null or invalid dates
        const { error: expensesError } = await supabase
            .from('expenses')
            .update({ created_at: currentTime })
            .or('created_at.is.null,created_at.eq.1970-01-01T00:00:00.000Z');
        
        // Fix teams with null or invalid dates
        const { error: teamsError } = await supabase
            .from('teams')
            .update({ created_at: currentTime })
            .or('created_at.is.null,created_at.eq.1970-01-01T00:00:00.000Z');
        
        // Fix amount requests with null or invalid dates
        const { error: requestsError } = await supabase
            .from('amount_requests')
            .update({ created_at: currentTime })
            .or('created_at.is.null,created_at.eq.1970-01-01T00:00:00.000Z');
        
        // Fix users with null or invalid dates
        const { error: usersError } = await supabase
            .from('users')
            .update({ created_at: currentTime })
            .or('created_at.is.null,created_at.eq.1970-01-01T00:00:00.000Z');
        
        if (expensesError || teamsError || requestsError || usersError) {
            console.error('Database error fixing dates:', { expensesError, teamsError, requestsError, usersError });
            return res.status(500).json({ error: 'Database error' });
        }
        
        console.log('Fixed null/invalid dates');
        res.json({ success: true });
    } catch (error) {
        console.error('Error fixing dates:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Dashboard statistics
app.get('/api/dashboard/stats', requireAdmin, async (req, res) => {
    const stats = {};
    const [{ count: teamCount, error: teamCountErr }, { data: totals, error: totalsErr }, { count: pendingCount, error: pendingErr }] = await Promise.all([
        supabase.from('teams').select('id', { count: 'exact', head: true }),
        supabase.from('teams').select('initial_amount, used_amount, remaining_amount'),
        supabase.from('amount_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
    ]);
    if (teamCountErr || totalsErr || pendingErr) {
        console.error('Database error:', teamCountErr || totalsErr || pendingErr);
            return res.status(500).json({ error: 'Database error' });
        }
    const sum = (arr, key) => (arr || []).reduce((acc, row) => acc + parseFloat(row[key] || 0), 0);
    stats.totalTeams = teamCount || 0;
    stats.totalBudget = sum(totals, 'initial_amount');
    stats.totalUsed = sum(totals, 'used_amount');
    stats.totalRemaining = sum(totals, 'remaining_amount');
    stats.pendingRequests = pendingCount || 0;
                res.json(stats);
});

// File download route
app.get('/api/download/:filename', requireAuth, async (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'uploads', filename);
    // Security check: verify file exists and user has access
    const { data: expense, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('attachment_path', filename)
        .single();
    if (error) {
        console.error('Database error:', error);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!expense) {
            return res.status(404).json({ error: 'File not found' });
        }
        if (req.session.userRole === 'field_staff' && expense.team_id !== req.session.teamId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (fs.existsSync(filePath)) {
            res.download(filePath, expense.attachment_name || filename);
        } else {
            res.status(404).json({ error: 'File not found on server' });
        }
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
    console.log(`🔗 Supabase: ${SUPABASE_URL ? 'configured' : 'NOT CONFIGURED'}`);
    console.log(`📂 Uploads: ${uploadsDir}`);
});