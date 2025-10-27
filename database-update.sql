-- Add created_by column to teams table to track which partner assigned the initial amount
-- Run this in your Supabase SQL Editor

-- 1. Add created_by column to teams table (using bigint to match users.id type)
ALTER TABLE teams ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id);

-- 2. Add comment to explain the field
COMMENT ON COLUMN teams.created_by IS 'User (partner/admin) who created the team and assigned initial amount';

-- 3. For existing teams without created_by, you can optionally set them to admin
-- UPDATE teams SET created_by = (SELECT id FROM users WHERE role = 'admin' LIMIT 1) WHERE created_by IS NULL;

