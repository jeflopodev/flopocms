import type { D1Database } from "@cloudflare/workers-types";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { getD1Database } from "./env";

export function getD1(locals?: App.Locals): D1Database {
  return getD1Database(locals);
}

/**
 * Returns a typed Drizzle ORM client connected to Cloudflare D1 with schema support.
 */
export function getDb(locals?: App.Locals) {
  const d1 = getD1(locals);
  return drizzle(d1);
}

export type DbClient = ReturnType<typeof getDb>;
export * from "../db/schema";

/**
 * @deprecated Schema migrations are now managed declaratively via Wrangler / Drizzle migrations.
 */
export async function ensureSchema(_locals?: App.Locals): Promise<void> {
  // No-op: D1 schema is managed via migrations
}
