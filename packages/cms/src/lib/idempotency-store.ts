import { eq, lt } from "drizzle-orm";
import type { DbClient } from "./db";
import { idempotencyKeys as keysTable } from "./db";
import type { Clock } from "./clock";

export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

export interface IdempotencyHit {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

export interface IdempotencyStore {
  find(key: string): Promise<IdempotencyHit | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  save(key: string, status: number, body: any, ttlSeconds?: number): Promise<void>;
}

export function createD1IdempotencyStore(db: DbClient, clock: Clock): IdempotencyStore {
  return {
    async find(key) {
      const [row] = await db.select().from(keysTable).where(eq(keysTable.key, key)).limit(1);
      if (!row) return null;
      if (row.expiresAt <= clock.now().toISOString()) {
        await db.delete(keysTable).where(eq(keysTable.key, key));
        return null;
      }
      try {
        const parsed = JSON.parse(row.response) as { status: number; body: unknown };
        return { status: parsed.status, body: parsed.body };
      } catch {
        return null;
      }
    },

    async save(key, status, body, ttlSeconds = IDEMPOTENCY_TTL_SECONDS) {
      const now = clock.now().toISOString();
      const expiresAt = new Date(clock.now().getTime() + ttlSeconds * 1000).toISOString();
      const response = JSON.stringify({ status, body });
      await db
        .insert(keysTable)
        .values({ key, response, createdAt: now, expiresAt })
        .onConflictDoNothing({ target: keysTable.key });
    },
  };
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private records = new Map<string, { status: number; body: unknown; expiresAt: string }>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async find(key: string): Promise<IdempotencyHit | null> {
    const record = this.records.get(key);
    if (!record) return null;
    if (record.expiresAt <= this.now().toISOString()) {
      this.records.delete(key);
      return null;
    }
    return { status: record.status, body: record.body };
  }

  async save(key: string, status: number, body: unknown, ttlSeconds = IDEMPOTENCY_TTL_SECONDS): Promise<void> {
    if (this.records.has(key)) return;
    const now = this.now();
    this.records.set(key, {
      status,
      body,
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
    });
  }
}

export async function pruneExpiredIdempotencyKeys(db: DbClient, nowIso: string): Promise<void> {
  await db.delete(keysTable).where(lt(keysTable.expiresAt, nowIso));
}
