-- Migration: Add name and picture columns to users table
-- Date: 2025-11-06
-- Purpose: Store Google OAuth profile information (name, picture URL)

ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS picture VARCHAR(512);

-- Optional: Add index on name for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_name ON users(name);
