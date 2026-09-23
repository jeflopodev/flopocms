-- ADR-0012 removes the divergence subsystem: the deploy no longer records what
-- `main` held, the Admin Dashboard no longer compares it, so the table goes.
DROP TABLE IF EXISTS main_snapshots;
