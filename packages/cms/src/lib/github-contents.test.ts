import { describe, expect, it } from "vitest";
import { InMemoryGithubContents } from "./github-contents";

describe("GithubContents", () => {
  it("round-trips a file and returns its sha", async () => {
    const contents = new InMemoryGithubContents();

    const written = await contents.putFile("src/content/blog/hello/index.mdx", "# Hello", {
      message: "feat(blog): publish",
    });
    expect(written.success).toBe(true);
    expect(written.sha).toBeTruthy();

    const read = await contents.readFile("src/content/blog/hello/index.mdx");
    expect(read).toEqual({ content: "# Hello", sha: written.sha });
  });

  it("returns null for a path that was never written", async () => {
    const contents = new InMemoryGithubContents();
    expect(await contents.readFile("src/content/blog/missing/index.mdx")).toBeNull();
  });

  it("records the commit message the caller supplied", async () => {
    const contents = new InMemoryGithubContents();

    await contents.putFile("public/uploads/hero.webp", new Uint8Array([1, 2, 3]), {
      message: "media(global): upload hero.webp [skip ci]",
    });

    expect(contents.commits).toEqual([
      { action: "put", path: "public/uploads/hero.webp", message: "media(global): upload hero.webp [skip ci]" },
    ]);
  });

  it("overwrites a file and reports the new sha", async () => {
    const contents = new InMemoryGithubContents();
    const first = await contents.putFile("a.txt", "one", { message: "first" });
    const second = await contents.putFile("a.txt", "two", { message: "second" });

    expect(second.sha).not.toEqual(first.sha);
    expect((await contents.readFile("a.txt"))?.content).toBe("two");
  });

  it("deletes a file once, then reports it was already absent", async () => {
    const contents = new InMemoryGithubContents();
    contents.seedFile("src/content/blog/old/index.mdx", "body");

    const first = await contents.deleteFile("src/content/blog/old/index.mdx", { message: "delete" });
    expect(first).toMatchObject({ success: true, deleted: true });

    const second = await contents.deleteFile("src/content/blog/old/index.mdx", { message: "delete" });
    expect(second).toMatchObject({ success: true, deleted: false });
  });

  it("does not record a commit for a delete that removed nothing", async () => {
    const contents = new InMemoryGithubContents();
    await contents.deleteFile("never-existed.txt", { message: "delete" });
    expect(contents.commits).toEqual([]);
  });

  it("deletes every file directly inside a Post Bundle", async () => {
    const contents = new InMemoryGithubContents();
    contents.seedFile("src/content/blog/bundle/index.mdx", "body");
    contents.seedFile("src/content/blog/bundle/cover.webp", "bytes");
    contents.seedFile("src/content/blog/other/index.mdx", "body");

    const res = await contents.deleteDirectory("src/content/blog/bundle", { message: "delete bundle" });

    expect(res).toMatchObject({ success: true, deleted: true });
    expect(contents.has("src/content/blog/bundle/index.mdx")).toBe(false);
    expect(contents.has("src/content/blog/bundle/cover.webp")).toBe(false);
    expect(contents.has("src/content/blog/other/index.mdx")).toBe(true);
  });

  it("reports deleted:false for a directory that was never there", async () => {
    const contents = new InMemoryGithubContents();
    expect(await contents.deleteDirectory("src/content/blog/missing", { message: "delete bundle" })).toMatchObject({
      success: true,
      deleted: false,
    });
  });

  it("does not let a directory delete reach a sibling with a shared prefix", async () => {
    const contents = new InMemoryGithubContents();
    contents.seedFile("src/content/blog/post-2/index.mdx", "body");
    contents.seedFile("src/content/blog/post-2-extra/index.mdx", "body");

    await contents.deleteDirectory("src/content/blog/post-2", { message: "delete bundle" });

    expect(contents.has("src/content/blog/post-2-extra/index.mdx")).toBe(true);
  });

  it("refuses a stale write with a conflict instead of overwriting", async () => {
    const contents = new InMemoryGithubContents();
    const first = await contents.putFile("a.txt", "one", { message: "first" });
    const stale = await contents.putFile("a.txt", "two", { message: "second", expectedSha: "sha-stale" });

    expect(stale).toMatchObject({ success: false, conflict: true });
    expect((await contents.readFile("a.txt"))?.sha).toBe(first.sha);
  });

  it("refuses a create-only write when the path already exists", async () => {
    const contents = new InMemoryGithubContents();
    contents.seedFile("a.txt", "one");

    const res = await contents.putFile("a.txt", "two", { message: "create", expectedSha: null });
    expect(res).toMatchObject({ success: false, conflict: true });
    expect((await contents.readFile("a.txt"))?.content).toBe("one");
  });

  it("lands every file in one atomic commit", async () => {
    const contents = new InMemoryGithubContents();

    const res = await contents.commitFiles(
      [
        { path: "src/content/blog/hello/index.mdx", content: "body" },
        { path: "public/uploads/hero.webp", content: new Uint8Array([1, 2, 3]) },
      ],
      { message: "feat(blog): publish" }
    );

    expect(res).toMatchObject({ success: true });
    expect(res.commitSha).toBeTruthy();
    expect(contents.has("src/content/blog/hello/index.mdx")).toBe(true);
    expect(contents.has("public/uploads/hero.webp")).toBe(true);
  });

  it("refuses an atomic commit based on a stale ref", async () => {
    const contents = new InMemoryGithubContents();
    const baseRef = contents.currentRef();
    await contents.putFile("other.txt", "other", { message: "other" });

    const res = await contents.commitFiles([{ path: "a.txt", content: "one" }], {
      message: "stale",
      baseRefSha: baseRef,
    });

    expect(res).toMatchObject({ success: false, conflict: true });
    expect(contents.has("a.txt")).toBe(false);
  });

  it("lists the files inside a directory and counts an absent one as empty", async () => {
    const contents = new InMemoryGithubContents();
    contents.seedFile("public/uploads/hero.webp", "bytes");
    contents.seedFile("public/uploads/report.pdf", "bytes");
    contents.seedFile("src/content/blog/hello/index.mdx", "body");

    expect(await contents.listDirectory("public/uploads")).toEqual({
      success: true,
      paths: ["public/uploads/hero.webp", "public/uploads/report.pdf"],
    });
    expect(await contents.listDirectory("public/missing")).toEqual({ success: true, paths: [] });
  });

  it("leaves nothing behind when an atomic commit fails", async () => {
    const contents = new InMemoryGithubContents();
    contents.failNextCommit("500 Internal Server Error");

    const res = await contents.commitFiles(
      [
        { path: "a.txt", content: "one" },
        { path: "b.txt", content: "two" },
      ],
      { message: "fail" }
    );

    expect(res.success).toBe(false);
    expect(contents.has("a.txt")).toBe(false);
    expect(contents.has("b.txt")).toBe(false);
  });
});
