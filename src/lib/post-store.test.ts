import { describe, expect, it } from "vitest";
import { InMemoryPostStore, type PostRecord } from "./post-store";

function record(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    slug: "untitled-article",
    title: "Untitled Article",
    description: "",
    category: "General",
    tags: "[]",
    author: "jeflopo",
    featuredImage: "",
    contentMdx: "<Paragraph>Body</Paragraph>",
    status: "draft",
    template: "default",
    defaultWidth: "60rem",
    wideWidth: "70rem",
    pubDate: "2026-09-21T12:00:00.000Z",
    createdAt: "2026-09-21T12:00:00.000Z",
    updatedAt: "2026-09-21T12:00:00.000Z",
    ...overrides,
  };
}

describe("PostStore", () => {
  it("finds a record by id and returns null for an unknown one", async () => {
    const store = new InMemoryPostStore([record()]);

    expect(await store.find("post-1")).toMatchObject({ slug: "untitled-article" });
    expect(await store.find("nobody")).toBeNull();
  });

  it("reports a slug as taken only when another Article holds it", async () => {
    const store = new InMemoryPostStore([record(), record({ id: "post-2", slug: "other" })]);

    expect(await store.slugTaken("other", "post-1")).toBe(true);
    expect(await store.slugTaken("untitled-article", "post-1")).toBe(false);
    expect(await store.slugTaken("free-slug", "post-1")).toBe(false);
  });

  it("inserts a new record and updates an existing one in place", async () => {
    const store = new InMemoryPostStore();
    await store.save(record());
    expect(store.all()).toHaveLength(1);

    await store.save(record({ title: "Renamed", status: "published" }));

    expect(store.all()).toHaveLength(1);
    expect(store.all()[0]).toMatchObject({ title: "Renamed", status: "published" });
  });

  it("keeps a snapshot rather than a reference to the caller's object", async () => {
    const store = new InMemoryPostStore();
    const original = record();
    await store.save(original);

    original.title = "Changed after the save";

    expect((await store.find("post-1"))?.title).toBe("Untitled Article");
  });

  it("removes a record", async () => {
    const store = new InMemoryPostStore([record()]);

    await store.remove("post-1");

    expect(await store.find("post-1")).toBeNull();
  });

  it("lists the editorial record most recently edited first", async () => {
    const store = new InMemoryPostStore([
      record({ id: "old", updatedAt: "2026-09-01T00:00:00.000Z" }),
      record({ id: "new", updatedAt: "2026-09-20T00:00:00.000Z" }),
      record({ id: "middle", updatedAt: "2026-09-10T00:00:00.000Z" }),
    ]);

    expect((await store.list()).map((r) => r.id)).toEqual(["new", "middle", "old"]);
  });

  it("lists nothing when the editorial record is empty", async () => {
    expect(await new InMemoryPostStore().list()).toEqual([]);
  });
});
