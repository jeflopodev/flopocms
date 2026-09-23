-- ADR-0009 made Drafts live in D1 and publishing commit straight to main, which left the
-- branch-and-PR bookkeeping from ADR-0004 writing nothing but NULLs. Nothing reads them.
ALTER TABLE posts DROP COLUMN git_branch;
ALTER TABLE posts DROP COLUMN pr_number;
ALTER TABLE posts DROP COLUMN pr_url;
