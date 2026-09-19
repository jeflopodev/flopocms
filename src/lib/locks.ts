import { eq, and } from "drizzle-orm";
import type { DbClient } from "./db";
import { postLocks, type PostLock } from "./db";

export interface LockResult {
  success: boolean;
  locked: boolean;
  isOwner: boolean;
  lock?: {
    userId: string;
    username: string;
    acquiredAt: string;
    expiresAt: string;
  };
}

/**
 * Checks the current lock status of a post.
 * Expired locks are treated as unlocked.
 */
export async function getLockStatus(
  db: DbClient,
  postId: string,
  currentUserId?: string
): Promise<LockResult> {
  const [existing] = await db
    .select()
    .from(postLocks)
    .where(eq(postLocks.postId, postId))
    .limit(1);

  if (!existing) {
    return { success: true, locked: false, isOwner: false };
  }

  const now = Date.now();
  const expiresAtMs = new Date(existing.expiresAt).getTime();

  if (expiresAtMs <= now) {
    // Lock is expired
    return { success: true, locked: false, isOwner: false };
  }

  const isOwner = Boolean(currentUserId && existing.userId === currentUserId);
  return {
    success: true,
    locked: !isOwner,
    isOwner,
    lock: {
      userId: existing.userId,
      username: existing.username,
      acquiredAt: existing.acquiredAt,
      expiresAt: existing.expiresAt,
    },
  };
}

/**
 * Acquires a pessimistic lock on a post for the given editor.
 * If already locked by another editor (and unexpired), returns locked: true.
 * If free, expired, or previously held by the same user, refreshes the lock.
 */
export async function acquireLock(
  db: DbClient,
  postId: string,
  user: { id: string; username: string },
  ttlSeconds = 45
): Promise<LockResult> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiresIso = new Date(nowMs + ttlSeconds * 1000).toISOString();

  const [existing] = await db
    .select()
    .from(postLocks)
    .where(eq(postLocks.postId, postId))
    .limit(1);

  if (existing) {
    const expiresAtMs = new Date(existing.expiresAt).getTime();
    const isExpired = expiresAtMs <= nowMs;
    const isSameUser = existing.userId === user.id;

    if (!isExpired && !isSameUser) {
      // Locked by someone else
      return {
        success: false,
        locked: true,
        isOwner: false,
        lock: {
          userId: existing.userId,
          username: existing.username,
          acquiredAt: existing.acquiredAt,
          expiresAt: existing.expiresAt,
        },
      };
    }

    // Refresh or take over expired lock
    await db
      .update(postLocks)
      .set({
        userId: user.id,
        username: user.username,
        acquiredAt: isSameUser ? existing.acquiredAt : nowIso,
        expiresAt: expiresIso,
      })
      .where(eq(postLocks.postId, postId));

    return {
      success: true,
      locked: false,
      isOwner: true,
      lock: {
        userId: user.id,
        username: user.username,
        acquiredAt: isSameUser ? existing.acquiredAt : nowIso,
        expiresAt: expiresIso,
      },
    };
  }

  // Create new lock
  await db.insert(postLocks).values({
    postId,
    userId: user.id,
    username: user.username,
    acquiredAt: nowIso,
    expiresAt: expiresIso,
  });

  return {
    success: true,
    locked: false,
    isOwner: true,
    lock: {
      userId: user.id,
      username: user.username,
      acquiredAt: nowIso,
      expiresAt: expiresIso,
    },
  };
}

/**
 * Renews the expiration of an existing lock during heartbeats.
 */
export async function renewLock(
  db: DbClient,
  postId: string,
  userId: string,
  ttlSeconds = 45
): Promise<boolean> {
  const nowMs = Date.now();
  const expiresIso = new Date(nowMs + ttlSeconds * 1000).toISOString();

  const result = await db
    .update(postLocks)
    .set({ expiresAt: expiresIso })
    .where(and(eq(postLocks.postId, postId), eq(postLocks.userId, userId)));

  return true;
}

/**
 * Immediately releases the lock on a post.
 * Allows the other editor to take over without waiting for the TTL.
 */
export async function releaseLock(
  db: DbClient,
  postId: string,
  userId?: string
): Promise<boolean> {
  if (userId) {
    await db
      .delete(postLocks)
      .where(and(eq(postLocks.postId, postId), eq(postLocks.userId, userId)));
  } else {
    await db.delete(postLocks).where(eq(postLocks.postId, postId));
  }
  return true;
}
