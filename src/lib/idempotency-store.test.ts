import { describe, expect, it } from "vitest";
import { InMemoryIdempotencyStore } from "./idempotency-store";

describe("InMemoryIdempotencyStore", () => {
  it("replays the stored result for the same key", async () => {
    const store = new InMemoryIdempotencyStore(() => new Date("2026-09-23T00:00:00.000Z"));
    await store.save("key-1", 200, { success: true, slug: "hello" });

    expect(await store.find("key-1")).toEqual({ status: 200, body: { success: true, slug: "hello" } });
  });

  it("keeps the first write when the same key arrives twice", async () => {
    const store = new InMemoryIdempotencyStore(() => new Date("2026-09-23T00:00:00.000Z"));
    await store.save("key-1", 200, { success: true, slug: "first" });
    await store.save("key-1", 200, { success: true, slug: "second" });

    expect((await store.find("key-1"))?.body).toMatchObject({ slug: "first" });
  });

  it("expires keys after their TTL", async () => {
    let now = new Date("2026-09-23T00:00:00.000Z");
    const store = new InMemoryIdempotencyStore(() => now);
    await store.save("key-1", 200, { success: true }, 60);

    now = new Date("2026-09-23T00:02:00.000Z");
    expect(await store.find("key-1")).toBeNull();
  });

  it("misses unknown keys", async () => {
    const store = new InMemoryIdempotencyStore();
    expect(await store.find("missing")).toBeNull();
  });
});
