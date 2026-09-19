import type { D1Database } from "@cloudflare/workers-types";
import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";

export function getD1(locals?: App.Locals): D1Database {
  const db =
    (env as any)?.DB ||
    (locals as any)?.cfContext?.env?.DB ||
    (locals as any)?.runtime?.env?.DB ||
    (locals as any)?.env?.DB;
  if (!db) {
    throw new Error(
      "D1 database binding 'DB' is not available. Ensure wrangler.jsonc contains the d1_databases binding for 'DB'."
    );
  }
  return db;
}

/**
 * Returns a typed Drizzle ORM client connected to Cloudflare D1
 */
export function getDb(locals?: App.Locals) {
  const d1 = getD1(locals);
  return drizzle(d1);
}

export type DbClient = ReturnType<typeof getDb>;
export * from "../db/schema";

let schemaMigrated = false;

/**
 * Self-healing schema migration:
 * Automatically ensures post_locks table and all posts columns exist in Cloudflare D1.
 * Prevents runtime 500 errors if D1 migrations haven't run on remote yet.
 */
export async function ensureSchema(locals?: App.Locals): Promise<void> {
  if (schemaMigrated) return;
  try {
    const d1 = getD1(locals);

    // 1. Ensure post_locks table and indices
    await d1.exec(`
      CREATE TABLE IF NOT EXISTS post_locks (
        post_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        acquired_at DATETIME NOT NULL,
        expires_at DATETIME NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_post_locks_user_id ON post_locks(user_id);
      CREATE INDEX IF NOT EXISTS idx_post_locks_expires_at ON post_locks(expires_at);
    `);

    // 2. Check existing columns in posts
    try {
      const { results } = await d1.prepare("PRAGMA table_info(posts)").all<{ name: string }>();
      const existingCols = new Set(results?.map((r) => r.name) || []);

      if (!existingCols.has("git_branch")) {
        await d1.exec("ALTER TABLE posts ADD COLUMN git_branch TEXT;");
      }
      if (!existingCols.has("pr_number")) {
        await d1.exec("ALTER TABLE posts ADD COLUMN pr_number INTEGER;");
      }
      if (!existingCols.has("pr_url")) {
        await d1.exec("ALTER TABLE posts ADD COLUMN pr_url TEXT;");
      }
    } catch (colErr) {
      console.warn("Column migration warning:", colErr);
    }

    schemaMigrated = true;
  } catch (err) {
    console.warn("ensureSchema warning:", err);
  }
}

