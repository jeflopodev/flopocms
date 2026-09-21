import { describe, expect, it } from "vitest";
import { InMemoryLockStore } from "./locks";
import type { Clock } from "./clock";

const START = new Date("2026-09-21T12:00:00.000Z");

/** A clock the test moves, which is the only reason the expiry rules are testable. */
function testClock(): Clock & { advance(seconds: number): void } {
  let now = START;

  return {
    now: () => now,
    advance: (seconds) => {
      now = new Date(now.getTime() + seconds * 1000);
    },
  };
}

const JEF = { id: "user-1", username: "jeflopo" };
const AFLO = { id: "user-2", username: "aflopo" };

describe("the Concurrency Lock", () => {
  it("tells the other Editor it is taken and the holder that it is theirs", async () => {
    const locks = new InMemoryLockStore(testClock());
    await locks.acquire("post-1", JEF);

    expect(await locks.status("post-1", JEF.id)).toMatchObject({ locked: false, isOwner: true });
    expect(await locks.status("post-1", AFLO.id)).toMatchObject({
      locked: true,
      isOwner: false,
      lock: { username: "jeflopo" },
    });
  });

  it("refuses a second Editor while the holder is inside the TTL", async () => {
    const clock = testClock();
    const locks = new InMemoryLockStore(clock);
    await locks.acquire("post-1", JEF, 45);

    clock.advance(44);

    expect(await locks.acquire("post-1", AFLO)).toMatchObject({ success: false, locked: true });
  });

  it("hands the Article over once the TTL has passed", async () => {
    const clock = testClock();
    const locks = new InMemoryLockStore(clock);
    await locks.acquire("post-1", JEF, 45);

    clock.advance(46);

    expect(await locks.status("post-1", AFLO.id)).toMatchObject({ locked: false });
    expect(await locks.acquire("post-1", AFLO)).toMatchObject({ success: true, isOwner: true });
  });

  it("extends the expiry on a heartbeat, and only for the holder", async () => {
    const clock = testClock();
    const locks = new InMemoryLockStore(clock);
    await locks.acquire("post-1", JEF, 45);

    clock.advance(40);
    expect(await locks.renew("post-1", JEF.id, 45)).toBe(true);
    expect(await locks.renew("post-1", AFLO.id, 45)).toBe(false);

    clock.advance(44);
    expect(await locks.status("post-1", AFLO.id)).toMatchObject({ locked: true });
  });

  it("releases immediately, and only for the holder", async () => {
    const locks = new InMemoryLockStore(testClock());
    await locks.acquire("post-1", JEF);

    expect(await locks.release("post-1", AFLO.id)).toBe(false);
    expect(await locks.release("post-1", JEF.id)).toBe(true);
    expect(await locks.status("post-1", AFLO.id)).toMatchObject({ locked: false });
  });

  it("keeps the acquisition time across a returning Editor's heartbeat", async () => {
    const clock = testClock();
    const locks = new InMemoryLockStore(clock);
    const first = await locks.acquire("post-1", JEF);

    clock.advance(10);
    const again = await locks.acquire("post-1", JEF);

    expect(again.lock?.acquiredAt).toBe(first.lock?.acquiredAt);
    expect(again.lock?.expiresAt).not.toBe(first.lock?.expiresAt);
  });
});
