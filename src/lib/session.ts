import { eq } from "drizzle-orm";
import type { DbClient } from "./db";
import { sessions, users } from "../db/schema";
import { generateSessionToken } from "./auth";

const SESSION_DURATION_DAYS = 30;

export interface SessionUser {
  id: string;
  username: string;
}

export async function createSession(db: DbClient, userId: string): Promise<string> {
  const token = generateSessionToken();
  const id = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

  await db.insert(sessions).values({
    id,
    userId,
    token,
    expiresAt: expiresAt.toISOString(),
  });

  return token;
}

export async function validateSession(
  db: DbClient,
  token: string
): Promise<SessionUser | null> {
  if (!token) return null;

  const results = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      username: users.username,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.token, token))
    .limit(1);

  const row = results[0];
  if (!row) return null;

  if (new Date(row.expiresAt) < new Date()) {
    // Session expired; delete it
    await db.delete(sessions).where(eq(sessions.id, row.sessionId));
    return null;
  }

  return {
    id: row.userId,
    username: row.username,
  };
}

export async function deleteSession(db: DbClient, token: string): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.token, token));
}
