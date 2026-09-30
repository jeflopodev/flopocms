-- Migration 0009: Add template column to posts and update assets table schema

-- 1. Add template column to posts
ALTER TABLE posts ADD COLUMN template TEXT NOT NULL DEFAULT 'default';

-- 2. Align assets table with current schema (assets has 0 rows)
DROP INDEX IF EXISTS idx_assets_post_slug;
DROP TABLE IF EXISTS assets;

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  alt_text TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_assets_filename ON assets(filename);
CREATE INDEX idx_assets_created_at ON assets(created_at);
