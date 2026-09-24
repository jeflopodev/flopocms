-- Migration 0002: Create post_locks table and add Git tracking columns to posts
CREATE TABLE IF NOT EXISTS post_locks (
  post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  acquired_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_post_locks_user_id ON post_locks(user_id);
CREATE INDEX IF NOT EXISTS idx_post_locks_expires_at ON post_locks(expires_at);

ALTER TABLE posts ADD COLUMN git_branch TEXT;
ALTER TABLE posts ADD COLUMN pr_number INTEGER;
ALTER TABLE posts ADD COLUMN pr_url TEXT;
