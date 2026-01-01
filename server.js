const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcrypt');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
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

// Supabase Storage bucket name
const STORAGE_BUCKET = 'Expense_Attachments';

// Multer configuration for file uploads (memory storage for Supabase)
const upload = multer({ 
    storage: multer.memoryStorage(), // Store in memory to upload to Supabase
    fileFilter: function (req, file, cb) {
        // Accept images and PDFs
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

// Middleware for admin OR partner access (partners can do most admin things except create partners)
const requireAdminOrPartner = (req, res, next) => {
    if (!req.session.userId || (req.session.userRole !== 'admin' && req.session.userRole !== 'partner')) {
        return res.status(403).json({ error: 'Admin or Partner access required' });
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
app.get('/api/teams', requireAdminOrPartner, async (req, res) => {
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

app.post('/api/teams', requireAdminOrPartner, async (req, res) => {
    const { name, location, initial_amount, description } = req.body;
    const createdBy = req.session.userId; // Track who created the team (partner/admin)
    
    console.log('Creating team with data:', { name, location, initial_amount, description, createdBy });
    
    // Validate required fields
    if (!name || !location || initial_amount === undefined) {
        console.error('Missing required fields:', { name, location, initial_amount });
        return res.status(400).json({ error: 'Missing required fields: name, location, and initial_amount are required' });
    }
    
    const remaining_amount = parseFloat(initial_amount);
    const initial_amt = parseFloat(initial_amount);

    const { data, error } = await supabase
        .from('teams')
        .insert([{ 
            name, 
            location, 
            initial_amount: initial_amt, 
            remaining_amount, 
            description: description || '', 
            created_by: createdBy,
            created_at: new Date().toISOString() 
        }])
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

app.get('/api/teams/:id/members', requireAdminOrPartner, async (req, res) => {
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
app.delete('/api/teams/:id', requireAdminOrPartner, async (req, res) => {
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
app.post('/api/users', requireAdminOrPartner, async (req, res) => {
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
app.delete('/api/users/:id', requireAdminOrPartner, async (req, res) => {
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
    let attachmentPath = null;
    let attachmentName = null;

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

    // Upload file to Supabase Storage if provided
    if (req.file) {
        try {
            attachmentName = req.file.originalname;
            const fileExt = path.extname(attachmentName);
            const uniqueFileName = `expense-${Date.now()}-${Math.round(Math.random() * 1E9)}${fileExt}`;
            const filePath = `${userId}/${uniqueFileName}`; // Organize by user ID

            // Upload to Supabase Storage
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from(STORAGE_BUCKET)
                .upload(filePath, req.file.buffer, {
                    contentType: req.file.mimetype,
                    upsert: false
                });

            if (uploadError) {
                console.error('Supabase Storage upload error:', uploadError);
                return res.status(500).json({ error: 'Failed to upload attachment: ' + uploadError.message });
            }

            // Store the file path (not the full URL, just the path)
            attachmentPath = filePath;
            console.log('✅ File uploaded to Supabase Storage:', filePath);
        } catch (uploadErr) {
            console.error('File upload error:', uploadErr);
            return res.status(500).json({ error: 'Failed to upload attachment' });
        }
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

app.put('/api/amount-requests/:id/approve', requireAdminOrPartner, async (req, res) => {
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

app.put('/api/amount-requests/:id/reject', requireAdminOrPartner, async (req, res) => {
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

// Fix existing null status requests (admin or partner)
app.put('/api/fix-null-requests', requireAdminOrPartner, async (req, res) => {
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

// Fix existing null/invalid dates (admin or partner)
app.put('/api/fix-null-dates', requireAdminOrPartner, async (req, res) => {
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
app.get('/api/dashboard/stats', requireAdminOrPartner, async (req, res) => {
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

// File download route - handles both old local files and new Supabase Storage files
app.get('/api/download/:filename(*)', requireAuth, async (req, res) => {
    // Express automatically decodes URL parameters, but handle both encoded and decoded cases
    let filename = req.params.filename;
    
    // Try to decode if it's still encoded (double-encoded case)
    try {
        const decoded = decodeURIComponent(filename);
        if (decoded !== filename) {
            filename = decoded;
        }
    } catch (e) {
        // Already decoded or invalid encoding, use as-is
    }
    
    // Security check: verify file exists and user has access
    // The filename might be:
    // 1. Just the basename (old format: "attachment-123.jpg")
    // 2. Full path (new format: "userId/expense-123.jpg")
    // 3. URL-encoded path (will be decoded by Express)
    
    const { data: expenses, error } = await supabase
        .from('expenses')
        .select('*')
        .not('attachment_path', 'is', null);
    
    if (error) {
        console.error('Database error:', error);
        return res.status(500).json({ error: 'Database error' });
    }
    
    // Find expense where attachment_path matches - use strict matching for security
    const expense = expenses?.find(e => {
        if (!e.attachment_path) return false;
        
        const storedPath = e.attachment_path;
        const storedPathParts = storedPath.split('/');
        const storedBasename = storedPathParts[storedPathParts.length - 1];
        
        // Strict matching: prefer exact matches, only use basename for old format (no path separator)
        // 1. Exact path match (most secure)
        if (storedPath === filename) return true;
        
        // 2. Handle URL encoding variations (exact match only)
        try {
            const decodedStored = decodeURIComponent(storedPath);
            const decodedFilename = decodeURIComponent(filename);
            if (decodedStored === decodedFilename) return true;
        } catch (e) {
            // Ignore decode errors
        }
        
        // 3. Basename match ONLY for old format files (no path separator in stored path)
        // This prevents basename-only access to new format files (which have paths)
        if (!storedPath.includes('/') && storedBasename === filename) return true;
        
        return false;
    });
    
    if (!expense) {
        return res.status(404).json({ error: 'File not found' });
    }
    
    // Enforce access control for all user types
    const userRole = req.session.userRole;
    const userTeamId = req.session.teamId;
    
    // Field staff can only access files from their own team
    if (userRole === 'field_staff') {
        if (expense.team_id !== userTeamId) {
            console.warn(`Access denied: Field staff ${req.session.userId} attempted to access file from team ${expense.team_id}`);
            return res.status(403).json({ error: 'Access denied: You can only access files from your own team' });
        }
    }
    // Admin and Partner can access all files (no additional check needed, but expense must exist)
    // The fact that we found an expense in the database is sufficient validation
    
    // Log access for security auditing
    console.log(`File access: ${userRole} ${req.session.userId} accessing expense ${expense.id} (team ${expense.team_id})`);
    
    try {
        const filePath = expense.attachment_path;
        
        // Check if this is an old local file (just filename, no path separator)
        if (!filePath.includes('/') && fs.existsSync(path.join(__dirname, 'uploads', filePath))) {
            // Old format - serve from local filesystem
            const localFilePath = path.join(__dirname, 'uploads', filePath);
            res.download(localFilePath, expense.attachment_name || filename);
            console.log('✅ File downloaded from local storage:', filePath);
            return;
        }
        
        // New format - download from Supabase Storage
        const { data: fileData, error: downloadError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .download(filePath);
        
        if (downloadError) {
            console.error('Supabase Storage download error:', downloadError);
            return res.status(404).json({ error: 'File not found in storage: ' + downloadError.message });
        }
        
        // Convert blob to buffer
        const arrayBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Determine content type
        const ext = path.extname(expense.attachment_name || filePath).toLowerCase();
        const contentTypeMap = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.pdf': 'application/pdf'
        };
        const contentType = contentTypeMap[ext] || 'application/octet-stream';
        
        // Set headers and send file
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${expense.attachment_name || filename}"`);
        res.send(buffer);
        
        console.log('✅ File downloaded from Supabase Storage:', filePath);
    } catch (downloadErr) {
        console.error('File download error:', downloadErr);
        res.status(500).json({ error: 'Failed to download file' });
    }
});

// File preview route - returns file data for preview (images/PDFs)
app.get('/api/preview/:filename(*)', requireAuth, async (req, res) => {
    // Express automatically decodes URL parameters, but handle both encoded and decoded cases
    let filename = req.params.filename;
    
    // Try to decode if it's still encoded (double-encoded case)
    try {
        const decoded = decodeURIComponent(filename);
        if (decoded !== filename) {
            filename = decoded;
        }
    } catch (e) {
        // Already decoded or invalid encoding, use as-is
    }
    
    const { data: expenses, error } = await supabase
        .from('expenses')
        .select('*')
        .not('attachment_path', 'is', null);
    
    if (error) {
        return res.status(500).json({ error: 'Database error' });
    }
    
    // Find expense where attachment_path matches - use strict matching for security
    const expense = expenses?.find(e => {
        if (!e.attachment_path) return false;
        
        const storedPath = e.attachment_path;
        const storedPathParts = storedPath.split('/');
        const storedBasename = storedPathParts[storedPathParts.length - 1];
        
        // Strict matching: prefer exact matches, only use basename for old format (no path separator)
        // 1. Exact path match (most secure)
        if (storedPath === filename) return true;
        
        // 2. Handle URL encoding variations (exact match only)
        try {
            const decodedStored = decodeURIComponent(storedPath);
            const decodedFilename = decodeURIComponent(filename);
            if (decodedStored === decodedFilename) return true;
        } catch (e) {
            // Ignore decode errors
        }
        
        // 3. Basename match ONLY for old format files (no path separator in stored path)
        // This prevents basename-only access to new format files (which have paths)
        if (!storedPath.includes('/') && storedBasename === filename) return true;
        
        return false;
    });
    
    if (!expense) {
        return res.status(404).json({ error: 'File not found' });
    }
    
    // Enforce access control for all user types
    const userRole = req.session.userRole;
    const userTeamId = req.session.teamId;
    
    // Field staff can only access files from their own team
    if (userRole === 'field_staff') {
        if (expense.team_id !== userTeamId) {
            console.warn(`Access denied: Field staff ${req.session.userId} attempted to access file from team ${expense.team_id}`);
            return res.status(403).json({ error: 'Access denied: You can only access files from your own team' });
        }
    }
    // Admin and Partner can access all files (no additional check needed, but expense must exist)
    // The fact that we found an expense in the database is sufficient validation
    
    // Log access for security auditing
    console.log(`File preview: ${userRole} ${req.session.userId} accessing expense ${expense.id} (team ${expense.team_id})`);
    
    try {
        const filePath = expense.attachment_path;
        
        // Check if old local file
        if (!filePath.includes('/') && fs.existsSync(path.join(__dirname, 'uploads', filePath))) {
            const localFilePath = path.join(__dirname, 'uploads', filePath);
            const ext = path.extname(filePath).toLowerCase();
            const contentTypeMap = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.pdf': 'application/pdf'
            };
            res.setHeader('Content-Type', contentTypeMap[ext] || 'application/octet-stream');
            res.sendFile(localFilePath);
            return;
        }
        
        // Download from Supabase Storage
        const { data: fileData, error: downloadError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .download(filePath);
        
        if (downloadError) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        const arrayBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const ext = path.extname(expense.attachment_name || filePath).toLowerCase();
        const contentTypeMap = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.pdf': 'application/pdf'
        };
        
        res.setHeader('Content-Type', contentTypeMap[ext] || 'application/octet-stream');
        res.send(buffer);
    } catch (err) {
        console.error('Preview error:', err);
        res.status(500).json({ error: 'Failed to load file' });
    }
});

// Partner Report routes

// Get list of partner role users for comparison
app.get('/api/partners', requireAuth, async (req, res) => {
    try {
        const { data: partners, error } = await supabase
            .from('users')
            .select('id, username, full_name, email, team_id, created_at')
            .eq('role', 'partner')
            .order('full_name', { ascending: true });
        
        if (error) {
            console.error('Database error:', error);
            return res.status(500).json({ error: 'Database error' });
        }
        
        // Enrich with team names
        if (partners && partners.length > 0) {
            const teamIds = [...new Set(partners.map(p => p.team_id).filter(Boolean))];
            if (teamIds.length > 0) {
                const { data: teams } = await supabase
                    .from('teams')
                    .select('id, name')
                    .in('id', teamIds);
                
                const teamsMap = new Map((teams || []).map(t => [t.id, t.name]));
                const enriched = partners.map(p => ({
                    ...p,
                    team_name: p.team_id ? teamsMap.get(p.team_id) : 'No Team'
                }));
                return res.json(enriched);
            }
        }
        
        res.json(partners || []);
    } catch (error) {
        console.error('Error fetching partners:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create a new partner
app.post('/api/partners', requireAdmin, async (req, res) => {
    const { username, password, full_name, email, team_id } = req.body;
    
    // Validate required fields
    if (!username || !password || !full_name) {
        return res.status(400).json({ error: 'Username, password, and full name are required' });
    }
    
    const hashedPassword = bcrypt.hashSync(password, 10);
    const { data, error} = await supabase
        .from('users')
        .insert([{ 
            username, 
            password: hashedPassword, 
            role: 'partner', // Partner role
            full_name, 
            email: email || '', 
            team_id: team_id || null, 
            created_at: new Date().toISOString() 
        }])
        .select('id')
        .single();
    
    if (error) {
        console.error('Database error:', error);
        if (error.message && error.message.toLowerCase().includes('duplicate')) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        return res.status(500).json({ error: 'Database error' });
    }
    
    console.log('Partner created with ID:', data.id);
    res.json({ success: true, id: data.id });
});

// Delete a partner
app.delete('/api/partners/:id', requireAdmin, async (req, res) => {
    const partnerId = req.params.id;
    
    console.log('Deleting partner with ID:', partnerId);
    
    // Check if partner has any expenses
    const { count: expenseCount, error: expCntErr } = await supabase
        .from('expenses')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', partnerId);
    
    if (expCntErr) {
        console.error('Database error:', expCntErr);
        return res.status(500).json({ error: 'Database error' });
    }
    
    if ((expenseCount || 0) > 0) {
        return res.status(400).json({ error: 'Cannot delete partner with existing expenses. Please remove all expenses first.' });
    }
    
    // Delete amount requests
    const { error: delReqsErr } = await supabase
        .from('amount_requests')
        .delete()
        .eq('user_id', partnerId);
    
    if (delReqsErr) {
        console.error('Database error deleting requests:', delReqsErr);
        return res.status(500).json({ error: 'Database error' });
    }
    
    // Delete the partner (only partner role)
    const { data: partnerData, error: getPartnerErr } = await supabase
        .from('users')
        .select('role')
        .eq('id', partnerId)
        .single();
    
    if (getPartnerErr) {
        console.error('Database error:', getPartnerErr);
        return res.status(500).json({ error: 'Database error' });
    }
    
    if (!partnerData || partnerData.role !== 'partner') {
        return res.status(404).json({ error: 'Partner not found or cannot delete non-partner users' });
    }
    
    const { error: delPartnerErr } = await supabase
        .from('users')
        .delete()
        .eq('id', partnerId);
    
    if (delPartnerErr) {
        console.error('Database error deleting partner:', delPartnerErr);
        return res.status(500).json({ error: 'Database error' });
    }
    
    console.log('Partner deleted successfully:', partnerId);
    res.json({ success: true });
});

// Get partner report data
// Partner Report - Compares amounts allocated/approved by two partners
app.get('/api/partner-report', requireAuth, async (req, res) => {
    try {
        const { partner1_id, partner2_id, from_date, to_date, team_id } = req.query;
        
        // Validate required parameters
        if (!partner1_id || !partner2_id) {
            return res.status(400).json({ error: 'Both partner1_id and partner2_id are required' });
        }
        
        console.log('📊 Generating partner report for:', { partner1_id, partner2_id, from_date, to_date });
        
        // Get partner names
        const { data: partner1 } = await supabase.from('users').select('full_name').eq('id', partner1_id).single();
        const { data: partner2 } = await supabase.from('users').select('full_name').eq('id', partner2_id).single();
        
        // 1. Fetch teams created by both partners (initial amounts assigned)
        let teamsQuery = supabase
            .from('teams')
            .select('id, name, location, initial_amount, created_by, created_at')
            .in('created_by', [partner1_id, partner2_id]);
        
        if (from_date && to_date) {
            // Add time to dates to include full day range
            const fromDateTime = from_date + 'T00:00:00';
            const toDateTime = to_date + 'T23:59:59';
            teamsQuery = teamsQuery
                .gte('created_at', fromDateTime)
                .lte('created_at', toDateTime);
            console.log('Date filter for teams:', { fromDateTime, toDateTime });
        }
        
        if (team_id) {
            teamsQuery = teamsQuery.eq('id', team_id);
        }
        
        const { data: teams, error: teamsError } = await teamsQuery.order('created_at', { ascending: false });
        
        if (teamsError) {
            console.error('Database error fetching teams:', teamsError);
            return res.status(500).json({ error: 'Database error fetching teams' });
        }
        
        console.log('Teams fetched:', teams?.length || 0, teams);
        
        // 2. Fetch amount requests approved by both partners
        let requestsQuery = supabase
            .from('amount_requests')
            .select('*, teams!amount_requests_team_id_fkey(id, name), users!amount_requests_user_id_fkey(full_name)')
            .in('processed_by', [partner1_id, partner2_id])
            .eq('status', 'approved');
        
        if (from_date && to_date) {
            // Add time to dates to include full day range
            const fromDateTime = from_date + 'T00:00:00';
            const toDateTime = to_date + 'T23:59:59';
            requestsQuery = requestsQuery
                .gte('processed_at', fromDateTime)
                .lte('processed_at', toDateTime);
            console.log('Date filter for requests:', { fromDateTime, toDateTime });
        }
        
        if (team_id) {
            requestsQuery = requestsQuery.eq('team_id', team_id);
        }
        
        const { data: requests, error: requestsError } = await requestsQuery.order('processed_at', { ascending: false });
        
        if (requestsError) {
            console.error('Database error fetching requests:', requestsError);
            return res.status(500).json({ error: 'Database error fetching requests' });
        }
        
        console.log('Requests fetched:', requests?.length || 0, requests);
        
        // 3. Calculate original initial amounts for teams
        // The current initial_amount includes approved requests, so we need to subtract them
        const teamIds = (teams || []).map(t => t.id);
        let originalInitialAmounts = {};
        
        if (teamIds.length > 0) {
            // Get all approved requests for these teams (regardless of who approved them)
            const { data: allTeamRequests, error: teamReqsError } = await supabase
                .from('amount_requests')
                .select('team_id, requested_amount')
                .in('team_id', teamIds)
                .eq('status', 'approved');
            
            if (!teamReqsError && allTeamRequests) {
                // Sum up all approved requests per team
                allTeamRequests.forEach(req => {
                    if (!originalInitialAmounts[req.team_id]) {
                        originalInitialAmounts[req.team_id] = 0;
                    }
                    // Validate requested_amount is a valid number before adding
                    const amount = parseFloat(req.requested_amount);
                    if (!isNaN(amount) && isFinite(amount) && amount >= 0) {
                        originalInitialAmounts[req.team_id] += amount;
                    } else {
                        console.warn(`Invalid requested_amount for request ${req.team_id}: ${req.requested_amount}`);
                    }
                });
            }
        }
        
        // Transform data into report format
        const reportData = [];
        
        // Process teams - Initial amounts assigned to teams (ORIGINAL amount, not updated)
        (teams || []).forEach(team => {
            // Calculate original initial amount by subtracting all approved requests
            const approvedRequestsTotal = originalInitialAmounts[team.id] || 0;
            const originalInitialAmount = parseFloat(team.initial_amount || 0) - approvedRequestsTotal;
            
            const partner1Amount = team.created_by == partner1_id ? originalInitialAmount : 0;
            const partner2Amount = team.created_by == partner2_id ? originalInitialAmount : 0;
            
            reportData.push({
                date: team.created_at,
                description: `Initial Amount Assigned to Team: ${team.name}`,
                partner1_amount: partner1Amount,
                partner2_amount: partner2Amount,
                difference: Math.abs(partner1Amount - partner2Amount),
                type: 'team_creation',
                team_name: team.name,
                category: 'Team Budget Allocation'
            });
        });
        
        // Process approved amount requests
        (requests || []).forEach(request => {
            // Safely parse requested_amount with fallback for null/undefined/invalid values
            const requestedAmount = parseFloat(request.requested_amount || 0);
            const safeAmount = (!isNaN(requestedAmount) && isFinite(requestedAmount) && requestedAmount >= 0) ? requestedAmount : 0;
            
            const partner1Amount = request.processed_by == partner1_id ? safeAmount : 0;
            const partner2Amount = request.processed_by == partner2_id ? safeAmount : 0;
            
            reportData.push({
                date: request.processed_at || request.created_at,
                description: `Approved Request: ${request.reason}`,
                partner1_amount: partner1Amount,
                partner2_amount: partner2Amount,
                difference: Math.abs(partner1Amount - partner2Amount),
                type: 'request_approval',
                team_name: request.teams?.name || 'Unknown',
                category: 'Additional Amount Approval',
                requested_by: request.users?.full_name || 'Unknown'
            });
        });
        
        // Sort by date descending
        reportData.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // Calculate totals
        const partner1_total = reportData.reduce((sum, item) => sum + item.partner1_amount, 0);
        const partner2_total = reportData.reduce((sum, item) => sum + item.partner2_amount, 0);
        
        const totals = {
            partner1_total: partner1_total,
            partner2_total: partner2_total,
            total_difference: partner1_total - partner2_total  // Signed difference to match frontend
        };
        
        console.log('✅ Partner report generated successfully:', {
            teams_count: teams?.length || 0,
            requests_count: requests?.length || 0,
            total_transactions: reportData.length,
            totals
        });
        
        res.json({
            partner1_name: partner1?.full_name || 'Partner 1',
            partner2_name: partner2?.full_name || 'Partner 2',
            data: reportData,
            totals: totals,
            filters: { from_date, to_date, team_id }
        });
        
    } catch (error) {
        console.error('Error generating partner report:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Export partner report to Excel
app.post('/api/partner-report/export/excel', requireAuth, async (req, res) => {
    try {
        const { partner1_name, partner2_name, data, totals, filters } = req.body;
        
        console.log('📊 Excel Export Request:', {
            partner1_name,
            partner2_name,
            data_rows: data?.length || 0,
            totals,
            filters
        });
        
        // Create workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Partner Report');
        
        // Add title
        worksheet.mergeCells('A1:G1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = 'Partner Allocation Report';
        titleCell.font = { size: 16, bold: true };
        titleCell.alignment = { horizontal: 'center' };
        
        // Add partner names
        worksheet.mergeCells('A2:G2');
        const partnersCell = worksheet.getCell('A2');
        partnersCell.value = `${partner1_name} vs ${partner2_name}`;
        partnersCell.font = { size: 12, bold: true };
        partnersCell.alignment = { horizontal: 'center' };
        
        // Add date range
        if (filters.from_date && filters.to_date) {
            worksheet.mergeCells('A3:G3');
            const dateCell = worksheet.getCell('A3');
            dateCell.value = `Period: ${new Date(filters.from_date).toLocaleDateString()} - ${new Date(filters.to_date).toLocaleDateString()}`;
            dateCell.alignment = { horizontal: 'center' };
        }
        
        // Add summary row
        worksheet.addRow([]);
        const summaryRow = worksheet.addRow([
            'Summary:',
            '',
            `${partner1_name}: $${totals.partner1_total.toFixed(2)}`,
            `${partner2_name}: $${totals.partner2_total.toFixed(2)}`,
            `Difference: $${totals.total_difference.toFixed(2)}`,
            '',
            ''
        ]);
        summaryRow.font = { bold: true };
        summaryRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE7E6E6' }
        };
        
        // Add empty row
        worksheet.addRow([]);
        
        // Add headers
        const headerRow = worksheet.addRow(['Date', 'Description', partner1_name, partner2_name, 'Difference', 'Team', 'Category']);
        headerRow.font = { bold: true };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4472C4' }
        };
        headerRow.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        });
        
        // Add data rows
        (data || []).forEach(item => {
            worksheet.addRow([
                new Date(item.date).toLocaleDateString(),
                item.description,
                '$' + item.partner1_amount.toFixed(2),
                '$' + item.partner2_amount.toFixed(2),
                '$' + item.difference.toFixed(2),
                item.team_name,
                item.category || '-'
            ]);
        });
        
        // Add totals row
        const totalsRow = worksheet.addRow([
            '',
            'TOTALS',
            '$' + totals.partner1_total.toFixed(2),
            '$' + totals.partner2_total.toFixed(2),
            '$' + totals.total_difference.toFixed(2),
            '',
            ''
        ]);
        totalsRow.font = { bold: true };
        totalsRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFD966' }
        };
        
        // Style columns
        worksheet.columns = [
            { width: 15 },  // Date
            { width: 45 },  // Description
            { width: 18 },  // Partner 1
            { width: 18 },  // Partner 2
            { width: 15 },  // Difference
            { width: 20 },  // Team
            { width: 25 }   // Category
        ];
        
        // For WebView compatibility, save file temporarily and return URL
        const path = require('path');
        const fs = require('fs').promises;
        
        // Create temp directory if it doesn't exist
        const tempDir = path.join(__dirname, 'temp');
        try {
            await fs.mkdir(tempDir, { recursive: true });
        } catch (err) {
            // Directory already exists
        }
        
        // Generate unique filename
        const filename = `partner-report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.xlsx`;
        const filepath = path.join(tempDir, filename);
        
        // Write file to temp directory
        await workbook.xlsx.writeFile(filepath);
        
        // Return file URL for download
        const fileUrl = `/api/download-temp/${filename}`;
        
        console.log('✅ Excel file saved:', filename);
        
        res.json({
            success: true,
            fileUrl: fileUrl,
            filename: filename
        });
        
    } catch (error) {
        console.error('Error exporting to Excel:', error);
        res.status(500).json({ error: 'Failed to export to Excel' });
    }
});

// Export partner report to PDF
app.post('/api/partner-report/export/pdf', requireAuth, async (req, res) => {
    try {
        const { partner1_name, partner2_name, data, totals, filters } = req.body;
        
        console.log('📄 PDF Export Request:', {
            partner1_name,
            partner2_name,
            data_rows: data?.length || 0,
            totals,
            filters
        });
        
        // For WebView compatibility, save file temporarily and return URL
        const path = require('path');
        const fs = require('fs');
        const fsPromises = require('fs').promises;
        
        // Create temp directory if it doesn't exist
        const tempDir = path.join(__dirname, 'temp');
        try {
            await fsPromises.mkdir(tempDir, { recursive: true });
        } catch (err) {
            // Directory already exists
        }
        
        // Generate unique filename
        const filename = `partner-report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.pdf`;
        const filepath = path.join(tempDir, filename);
        
        // Create PDF document
        const doc = new PDFDocument({ margin: 50 });
        
        // Pipe PDF to file
        const writeStream = fs.createWriteStream(filepath);
        doc.pipe(writeStream);
        
        // Add title
        doc.fontSize(20).font('Helvetica-Bold').text('Partner Allocation Report', { align: 'center' });
        doc.moveDown(0.5);
        
        // Add partner names
        doc.fontSize(14).font('Helvetica-Bold').text(`${partner1_name} vs ${partner2_name}`, { align: 'center' });
        doc.moveDown(0.5);
        
        // Add date range
        if (filters.from_date && filters.to_date) {
            doc.fontSize(10).font('Helvetica').text(
                `Period: ${new Date(filters.from_date).toLocaleDateString()} - ${new Date(filters.to_date).toLocaleDateString()}`,
                { align: 'center' }
            );
        }
        doc.moveDown(0.5);
        
        // Add subtitle
        doc.fontSize(9).font('Helvetica').fillColor('#666').text(
            'Comparison of amounts allocated to teams and approved for requests',
            { align: 'center' }
        );
        doc.fillColor('#000');
        doc.moveDown(1);
        
        // Add summary boxes
        const summaryY = doc.y;
        const boxWidth = 150;
        const boxHeight = 60;
        const spacing = 20;
        
        // Partner 1 Total
        doc.rect(50, summaryY, boxWidth, boxHeight).fillAndStroke('#d4edda', '#28a745');
        doc.fillColor('#000').fontSize(10).font('Helvetica-Bold').text(partner1_name, 60, summaryY + 10, { width: boxWidth - 20 });
        doc.fontSize(16).text(`$${totals.partner1_total.toFixed(2)}`, 60, summaryY + 30);
        
        // Partner 2 Total
        doc.rect(50 + boxWidth + spacing, summaryY, boxWidth, boxHeight).fillAndStroke('#cce5ff', '#007bff');
        doc.fillColor('#000').fontSize(10).font('Helvetica-Bold').text(partner2_name, 60 + boxWidth + spacing, summaryY + 10, { width: boxWidth - 20 });
        doc.fontSize(16).text(`$${totals.partner2_total.toFixed(2)}`, 60 + boxWidth + spacing, summaryY + 30);
        
        // Total Difference
        doc.rect(50 + (boxWidth + spacing) * 2, summaryY, boxWidth, boxHeight).fillAndStroke('#fff3cd', '#ffc107');
        doc.fillColor('#000').fontSize(10).font('Helvetica-Bold').text('Total Difference', 60 + (boxWidth + spacing) * 2, summaryY + 10, { width: boxWidth - 20 });
        doc.fontSize(16).text(`$${totals.total_difference.toFixed(2)}`, 60 + (boxWidth + spacing) * 2, summaryY + 30);
        
        doc.y = summaryY + boxHeight + 30;
        
        // Add table headers
        const tableTop = doc.y;
        const col1X = 50;
        const col2X = 120;
        const col3X = 320;
        const col4X = 390;
        const col5X = 460;
        
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Date', col1X, tableTop);
        doc.text('Description', col2X, tableTop);
        doc.text(partner1_name.substring(0, 8), col3X, tableTop);
        doc.text(partner2_name.substring(0, 8), col4X, tableTop);
        doc.text('Diff', col5X, tableTop);
        
        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
        
        // Add data rows
        let currentY = tableTop + 25;
        doc.fontSize(9).font('Helvetica');
        
        (data || []).slice(0, 30).forEach(item => { // Limit to 30 rows for PDF
            if (currentY > 700) {
                doc.addPage();
                currentY = 50;
            }
            
            doc.text(new Date(item.date).toLocaleDateString(), col1X, currentY, { width: 65 });
            doc.text(item.description.substring(0, 30), col2X, currentY, { width: 190 });
            doc.text(`$${item.partner1_amount.toFixed(2)}`, col3X, currentY);
            doc.text(`$${item.partner2_amount.toFixed(2)}`, col4X, currentY);
            doc.text(`$${item.difference.toFixed(2)}`, col5X, currentY);
            
            currentY += 20;
        });
        
        // Add footer
        doc.fontSize(8).text(
            `Generated on ${new Date().toLocaleString()}`,
            50,
            doc.page.height - 50,
            { align: 'center' }
        );
        
        // Finalize PDF and wait for file to be written
        doc.end();
        
        // Wait for write stream to finish
        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });
        
        // Return file URL for download
        const fileUrl = `/api/download-temp/${filename}`;
        
        console.log('✅ PDF file saved:', filename);
        
        res.json({
            success: true,
            fileUrl: fileUrl,
            filename: filename
        });
        
    } catch (error) {
        console.error('Error exporting to PDF:', error);
        res.status(500).json({ error: 'Failed to export to PDF' });
    }
});

// Serve temporary export files (WebView compatible)
app.get('/api/download-temp/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filepath = path.join(__dirname, 'temp', filename);
        
        // Security: Prevent directory traversal
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).json({ error: 'Invalid filename' });
        }
        
        // Check if file exists
        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        // Set appropriate headers based on file extension
        const ext = path.extname(filename).toLowerCase();
        if (ext === '.pdf') {
            res.setHeader('Content-Type', 'application/pdf');
        } else if (ext === '.xlsx') {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        }
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        // Send file
        res.sendFile(filepath, (err) => {
            if (err) {
                console.error('Error sending file:', err);
            } else {
                // Delete file after successful download (after a delay to ensure download completes)
                setTimeout(() => {
                    fs.unlink(filepath, (unlinkErr) => {
                        if (unlinkErr) {
                            console.error('Error deleting temp file:', unlinkErr);
                        } else {
                            console.log('🗑️  Temp file deleted:', filename);
                        }
                    });
                }, 5000); // 5 second delay
            }
        });
        
    } catch (error) {
        console.error('Error serving temp file:', error);
        res.status(500).json({ error: 'Failed to serve file' });
    }
});

// Cleanup old temp files on server start
const cleanupTempFiles = () => {
    const tempDir = path.join(__dirname, 'temp');
    if (fs.existsSync(tempDir)) {
        fs.readdir(tempDir, (err, files) => {
            if (err) return;
            
            files.forEach(file => {
                const filepath = path.join(tempDir, file);
                fs.stat(filepath, (statErr, stats) => {
                    if (statErr) return;
                    
                    // Delete files older than 1 hour
                    const now = new Date().getTime();
                    const fileTime = new Date(stats.mtime).getTime();
                    if (now - fileTime > 3600000) { // 1 hour
                        fs.unlink(filepath, (unlinkErr) => {
                            if (!unlinkErr) {
                                console.log('🗑️  Cleaned up old temp file:', file);
                            }
                        });
                    }
                });
            });
        });
    }
};

// Run cleanup on start and periodically
cleanupTempFiles();
setInterval(cleanupTempFiles, 3600000); // Every hour

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
    console.log(`📦 Storage: ${SUPABASE_URL ? `Supabase Storage (${STORAGE_BUCKET})` : 'NOT CONFIGURED'}`);
});