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
 * Automatically ensures all required tables and columns exist in Cloudflare D1.
 * Uses isolated d1.prepare().run() statements to guarantee fault-tolerant execution.
 */
export async function ensureSchema(locals?: App.Locals): Promise<void> {
  if (schemaMigrated) return;
  try {
    const d1 = getD1(locals);

    // 1. Ensure post_locks table
    try {
      await d1
        .prepare(
          `CREATE TABLE IF NOT EXISTS post_locks (
            post_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            acquired_at DATETIME NOT NULL,
            expires_at DATETIME NOT NULL
          )`
        )
        .run();
    } catch (err) {
      console.warn("post_locks table creation warning:", err);
    }

    // 2. Ensure post_locks indices
    try {
      await d1.prepare("CREATE INDEX IF NOT EXISTS idx_post_locks_user_id ON post_locks(user_id)").run();
    } catch {}
    try {
      await d1.prepare("CREATE INDEX IF NOT EXISTS idx_post_locks_expires_at ON post_locks(expires_at)").run();
    } catch {}

    // 3. Ensure all columns in posts table
    try {
      const { results: postCols } = await d1.prepare("PRAGMA table_info(posts)").all<{ name: string }>();
      const existingPostCols = new Set((postCols || []).map((r) => r.name));

      const missingPostColumns: Array<{ name: string; sql: string }> = [
        { name: "template", sql: "ALTER TABLE posts ADD COLUMN template TEXT DEFAULT 'default'" },
        { name: "default_width", sql: "ALTER TABLE posts ADD COLUMN default_width TEXT DEFAULT '60rem'" },
        { name: "wide_width", sql: "ALTER TABLE posts ADD COLUMN wide_width TEXT DEFAULT '70rem'" },
        { name: "git_branch", sql: "ALTER TABLE posts ADD COLUMN git_branch TEXT" },
        { name: "pr_number", sql: "ALTER TABLE posts ADD COLUMN pr_number INTEGER" },
        { name: "pr_url", sql: "ALTER TABLE posts ADD COLUMN pr_url TEXT" },
      ];

      for (const col of missingPostColumns) {
        if (!existingPostCols.has(col.name)) {
          try {
            await d1.prepare(col.sql).run();
            console.log(`[ensureSchema] Added column ${col.name} to posts`);
          } catch (alterErr) {
            console.warn(`[ensureSchema] Column ${col.name} warning:`, alterErr);
          }
        }
      }
    } catch (colErr) {
      console.warn("Posts column migration error:", colErr);
    }

    // 4. Ensure all columns in assets table
    try {
      const { results: assetCols } = await d1.prepare("PRAGMA table_info(assets)").all<{ name: string }>();
      const existingAssetCols = new Set((assetCols || []).map((r) => r.name));

      const missingAssetColumns: Array<{ name: string; sql: string }> = [
        { name: "original_name", sql: "ALTER TABLE assets ADD COLUMN original_name TEXT DEFAULT ''" },
        { name: "url", sql: "ALTER TABLE assets ADD COLUMN url TEXT DEFAULT ''" },
        { name: "title", sql: "ALTER TABLE assets ADD COLUMN title TEXT DEFAULT ''" },
        { name: "alt_text", sql: "ALTER TABLE assets ADD COLUMN alt_text TEXT DEFAULT ''" },
        { name: "description", sql: "ALTER TABLE assets ADD COLUMN description TEXT DEFAULT ''" },
        { name: "updated_at", sql: "ALTER TABLE assets ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP" },
      ];

      for (const col of missingAssetColumns) {
        if (!existingAssetCols.has(col.name)) {
          try {
            await d1.prepare(col.sql).run();
            console.log(`[ensureSchema] Added column ${col.name} to assets`);
          } catch (alterErr) {
            console.warn(`[ensureSchema] Column ${col.name} warning:`, alterErr);
          }
        }
      }
    } catch (assetColErr) {
      console.warn("Assets column migration error:", assetColErr);
    }

    schemaMigrated = true;
  } catch (err) {
    console.warn("ensureSchema critical error:", err);
  }
}



