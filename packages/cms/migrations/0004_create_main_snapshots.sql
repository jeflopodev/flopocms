-- What `main` held when the last deploy read it, so the runtime can show the Article Store
-- divergence report (ADR-0011). Written by the deploy, read by the Admin Dashboard.
CREATE TABLE IF NOT EXISTS main_snapshots (
  id TEXT PRIMARY KEY,
  articles TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
