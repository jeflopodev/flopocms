import { describe, expect, it } from "vitest";
import { DEFAULT_UPLOADS_DIR } from "./env";
import { InMemoryGithubContents } from "./github-contents";
import { GitHubMediaAdapter } from "./media-storage";

const STORED = `${DEFAULT_UPLOADS_DIR}/hero.webp`;

describe("GitHubMediaAdapter", () => {
  it("writes media into the global upload path and skips the production build", async () => {
    const contents = new InMemoryGithubContents();
    const media = new GitHubMediaAdapter(contents, DEFAULT_UPLOADS_DIR);

    const res = await media.writeMedia({
      filename: "hero.webp",
      content: new Uint8Array([1, 2, 3]),
      mimeType: "image/webp",
    });

    expect(res).toEqual({ success: true, url: "/uploads/hero.webp" });
    expect(contents.has(STORED)).toBe(true);
    expect(contents.commits[0]).toEqual({
      action: "put",
      path: STORED,
      message: "media(global): upload hero.webp [skip ci]",
    });
  });

  it("surfaces a storage failure instead of reporting success", async () => {
    const media = new GitHubMediaAdapter({
      readFile: async () => null,
      readBytes: async () => null,
      refSha: async () => null,
      putFile: async () => ({ success: false, error: "quota exceeded" }),
      deleteFile: async () => ({ success: true, deleted: false }),
      deleteDirectory: async () => ({ success: true, deleted: false }),
      commitFiles: async () => ({ success: false, error: "quota exceeded" }),
      listDirectory: async () => ({ success: true, paths: [] }),
    }, DEFAULT_UPLOADS_DIR);

    const res = await media.writeMedia({ filename: "big.zip", content: new Uint8Array([1]) });

    expect(res).toEqual({ success: false, error: "quota exceeded" });
  });

  it("deletes media from the global upload path", async () => {
    const contents = new InMemoryGithubContents();
    contents.seedFile(STORED, "bytes");
    const media = new GitHubMediaAdapter(contents, DEFAULT_UPLOADS_DIR);

    expect(await media.deleteMedia("hero.webp")).toMatchObject({ success: true });
    expect(contents.has(STORED)).toBe(false);
    expect(contents.commits[0].message).toBe("media(global): delete hero.webp");
  });

  it("reads media bytes back byte-for-byte", async () => {
    const contents = new InMemoryGithubContents();
    const media = new GitHubMediaAdapter(contents, DEFAULT_UPLOADS_DIR);
    const bytes = new Uint8Array([137, 80, 78, 71, 0, 255, 13, 10]);

    const written = await media.writeMedia({
      filename: "hero.webp",
      content: bytes,
      mimeType: "image/webp",
    });
    expect(written.success).toBe(true);

    expect(await media.readMedia("hero.webp")).toEqual(bytes);
  });

  it("returns null when reading media that was never written", async () => {
    const contents = new InMemoryGithubContents();
    const media = new GitHubMediaAdapter(contents, DEFAULT_UPLOADS_DIR);

    expect(await media.readMedia("missing.webp")).toBeNull();
  });
});
