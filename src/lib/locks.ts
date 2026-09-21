import { eq, and } from "drizzle-orm";
import type { DbClient } from "./db";
import { postLocks } from "./db";
import { systemClock, type Clock } from "./clock";

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
 * The Concurrency Lock seam.
 *
 * Callers hold a Lock Store rather than four free functions bound to a database, so a
 * module that must respect locks can be exercised without one — and so no route reaches
 * for a query builder to ask who is editing.
 */
export interface LockStore {
  status(postId: string, currentUserId?: string): Promise<LockResult>;
  acquire(postId: string, user: { id: string; username: string }, ttlSeconds?: number): Promise<LockResult>;
  renew(postId: string, userId: string, ttlSeconds?: number): Promise<boolean>;
  release(postId: string, userId?: string): Promise<boolean>;
}

/**
 * The D1-backed Concurrency Lock.
 *
 * Every verb swallows a database error and answers permissively: an unavailable locks
 * table must never block an Editor from working, and the lock is a courtesy between two
 * people rather than a safety mechanism for data.
 */
export function createD1LockStore(db: DbClient, clock: Clock = systemClock): LockStore {
  /** Expired locks count as unlocked. */
  async function status(postId: string, currentUserId?: string): Promise<LockResult> {
    try {
      const [existing] = await db
        .select()
        .from(postLocks)
        .where(eq(postLocks.postId, postId))
        .limit(1);

      if (!existing) {
        return { success: true, locked: false, isOwner: false };
      }

      if (new Date(existing.expiresAt).getTime() <= clock.now().getTime()) {
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
    } catch (err) {
      console.warn("Lock status fallback (unlocked):", err);
      return { success: true, locked: false, isOwner: false };
    }
  }

  /**
   * Acquires a pessimistic lock. If another Editor holds an unexpired one, reports it;
   * if the post is free, the lock expired, or the same Editor is returning, refreshes it.
   */
  async function acquire(
    postId: string,
    user: { id: string; username: string },
    ttlSeconds = 45
  ): Promise<LockResult> {
    try {
      const now = clock.now();
      const nowMs = now.getTime();
      const nowIso = now.toISOString();
      const expiresIso = new Date(nowMs + ttlSeconds * 1000).toISOString();

      const [existing] = await db
        .select()
        .from(postLocks)
        .where(eq(postLocks.postId, postId))
        .limit(1);

      if (existing) {
        const isExpired = new Date(existing.expiresAt).getTime() <= nowMs;
        const isSameUser = existing.userId === user.id;

        if (!isExpired && !isSameUser) {
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

        const acquiredAt = isSameUser ? existing.acquiredAt : nowIso;
        await db
          .update(postLocks)
          .set({ userId: user.id, username: user.username, acquiredAt, expiresAt: expiresIso })
          .where(eq(postLocks.postId, postId));

        return {
          success: true,
          locked: false,
          isOwner: true,
          lock: { userId: user.id, username: user.username, acquiredAt, expiresAt: expiresIso },
        };
      }

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
        lock: { userId: user.id, username: user.username, acquiredAt: nowIso, expiresAt: expiresIso },
      };
    } catch (err) {
      console.warn("Lock acquire fallback:", err);
      return { success: true, locked: false, isOwner: true };
    }
  }

  /** Extends the expiry during a heartbeat. */
  async function renew(postId: string, userId: string, ttlSeconds = 45): Promise<boolean> {
    try {
      const expiresIso = new Date(clock.now().getTime() + ttlSeconds * 1000).toISOString();
      await db
        .update(postLocks)
        .set({ expiresAt: expiresIso })
        .where(and(eq(postLocks.postId, postId), eq(postLocks.userId, userId)));
      return true;
    } catch (err) {
      console.warn("Lock renew warning:", err);
      return false;
    }
  }

  /** Releases immediately, so the other Editor need not wait for the TTL. */
  async function release(postId: string, userId?: string): Promise<boolean> {
    try {
      if (userId) {
        await db
          .delete(postLocks)
          .where(and(eq(postLocks.postId, postId), eq(postLocks.userId, userId)));
      } else {
        await db.delete(postLocks).where(eq(postLocks.postId, postId));
      }
      return true;
    } catch (err) {
      console.warn("Lock release warning:", err);
      return false;
    }
  }

  return { status, acquire, renew, release };
}

interface HeldLock {
  userId: string;
  username: string;
  acquiredAt: string;
  expiresAt: string;
}

/**
 * Local substitute for the Concurrency Lock, with the same expiry rules.
 *
 * It reads the time through the same Clock the D1 adapter does, so neither of them is the
 * easier one to exercise.
 */
export class InMemoryLockStore implements LockStore {
  private locks = new Map<string, HeldLock>();

  constructor(private readonly clock: Clock = systemClock) {}

  private live(postId: string): HeldLock | undefined {
    const held = this.locks.get(postId);
    if (!held) return undefined;
    if (new Date(held.expiresAt).getTime() <= this.clock.now().getTime()) {
      return undefined;
    }
    return held;
  }

  async status(postId: string, currentUserId?: string): Promise<LockResult> {
    const held = this.live(postId);
    if (!held) return { success: true, locked: false, isOwner: false };

    const isOwner = Boolean(currentUserId && held.userId === currentUserId);
    return { success: true, locked: !isOwner, isOwner, lock: { ...held } };
  }

  async acquire(postId: string, user: { id: string; username: string }, ttlSeconds = 45): Promise<LockResult> {
    const nowMs = this.clock.now().getTime();
    const nowIso = new Date(nowMs).toISOString();
    const held = this.live(postId);

    if (held && held.userId !== user.id) {
      return { success: false, locked: true, isOwner: false, lock: { ...held } };
    }

    const acquiredAt = held?.userId === user.id ? held.acquiredAt : nowIso;
    const lock = {
      userId: user.id,
      username: user.username,
      acquiredAt,
      expiresAt: new Date(nowMs + ttlSeconds * 1000).toISOString(),
    };
    this.locks.set(postId, lock);

    return { success: true, locked: false, isOwner: true, lock };
  }

  async renew(postId: string, userId: string, ttlSeconds = 45): Promise<boolean> {
    const held = this.live(postId);
    if (!held || held.userId !== userId) return false;

    held.expiresAt = new Date(this.clock.now().getTime() + ttlSeconds * 1000).toISOString();
    return true;
  }

  async release(postId: string, userId?: string): Promise<boolean> {
    const held = this.locks.get(postId);
    if (!held) return true;
    if (userId && held.userId !== userId) return false;

    this.locks.delete(postId);
    return true;
  }
}
