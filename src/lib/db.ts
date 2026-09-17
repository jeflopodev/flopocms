import type { D1Database } from "@cloudflare/workers-types";
import { env } from "cloudflare:workers";

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  salt: string;
  created_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
}

export interface PostRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string; // JSON string array
  author: string;
  featured_image: string;
  content_mdx: string;
  status: "draft" | "published";
  pub_date: string;
  created_at: string;
  updated_at: string;
}

export interface AssetRow {
  id: string;
  post_slug: string;
  filename: string;
  mime_type: string;
  byte_size: number;
  github_url: string;
  created_at: string;
}

/**
 * Extracts the D1Database instance from cloudflare:workers env
 */
export function getDb(locals?: App.Locals): D1Database {
  const db = (env as any)?.DB || (locals as any)?.cfContext?.env?.DB;
  if (!db) {
    throw new Error(
      "D1 database binding 'DB' is not available. Ensure wrangler.jsonc contains the d1_databases binding for 'DB'."
    );
  }
  return db;
}
