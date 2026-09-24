-- Migration 0003: Add stretch width columns to posts
ALTER TABLE posts ADD COLUMN default_width TEXT DEFAULT '60rem';
ALTER TABLE posts ADD COLUMN wide_width TEXT DEFAULT '70rem';
