-- Migration 0003: Add template, stretch width, and missing asset columns
ALTER TABLE posts ADD COLUMN template TEXT DEFAULT 'default';
ALTER TABLE posts ADD COLUMN default_width TEXT DEFAULT '60rem';
ALTER TABLE posts ADD COLUMN wide_width TEXT DEFAULT '70rem';

ALTER TABLE assets ADD COLUMN original_name TEXT DEFAULT '';
ALTER TABLE assets ADD COLUMN url TEXT DEFAULT '';
ALTER TABLE assets ADD COLUMN title TEXT DEFAULT '';
ALTER TABLE assets ADD COLUMN alt_text TEXT DEFAULT '';
ALTER TABLE assets ADD COLUMN description TEXT DEFAULT '';
ALTER TABLE assets ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP;
