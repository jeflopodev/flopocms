-- Migration 0008: Split Meta Description from Excerpt
ALTER TABLE posts ADD COLUMN excerpt TEXT DEFAULT '';
