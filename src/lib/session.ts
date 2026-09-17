import type { D1Database } from "@cloudflare/workers-types";
import { generateSessionToken } from "./auth";
import type { UserRow } from "./db";

const SESSION_DURATION_DAYS = 30;

export interface SessionUser {
  id: string;
  username: string;
}

export async function createSession(db: D1Database, userId: string): Promise<string> {
  const token = generateSessionToken();
  const id = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

  await db
    .prepare("INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)")
    .bind(id, userId, token, expiresAt.toISOString())
    .run();

  return token;
}

export async function validateSession(
  db: D1Database,
  token: string
): Promise<SessionUser | null> {
  if (!token) return null;

  const row = await db
    .prepare(
      `SELECT s.id as session_id, s.expires_at, u.id as user_id, u.username
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = ?`
    )
    .bind(token)
    .first<{ session_id: string; expires_at: string; user_id: string; username: string }>();

  if (!row) return null;

  if (new Date(row.expires_at) < new Date()) {
    // Session expired; clean it up
    await db.prepare("DELETE FROM sessions WHERE id = ?").bind(row.session_id).run();
    return null;
  }

  return {
    id: row.user_id,
    username: row.username,
  };
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  if (!token) return;
  await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
}
