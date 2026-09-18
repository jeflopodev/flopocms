import type { D1Database } from "@cloudflare/workers-types";
import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";

export function getD1(locals?: App.Locals): D1Database {
  const db = (env as any)?.DB || (locals as any)?.cfContext?.env?.DB;
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
