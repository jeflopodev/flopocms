import { describe, expect, it } from "vitest";
import { InMemoryGithubContents } from "./github-contents";
import { GitHubMediaAdapter } from "./media-storage";

describe("GitHubMediaAdapter", () => {
  it("writes media into the global upload path and skips the production build", async () => {
    const contents = new InMemoryGithubContents();
    const media = new GitHubMediaAdapter(contents);

    const res = await media.writeMedia({
      filename: "hero.webp",
      content: new Uint8Array([1, 2, 3]),
      mimeType: "image/webp",
    });

    expect(res).toEqual({ success: true, url: "/uploads/hero.webp" });
    expect(contents.has("public/uploads/hero.webp")).toBe(true);
    expect(contents.commits[0]).toEqual({
      action: "put",
      path: "public/uploads/hero.webp",
      message: "media(global): upload hero.webp [skip ci]",
    });
  });

  it("surfaces a storage failure instead of reporting success", async () => {
    const media = new GitHubMediaAdapter({
      readFile: async () => null,
      putFile: async () => ({ success: false, error: "quota exceeded" }),
      deleteFile: async () => ({ success: true, deleted: false }),
      deleteDirectory: async () => ({ success: true, deleted: false }),
      deleteBranch: async () => true,
    });

    const res = await media.writeMedia({ filename: "big.zip", content: new Uint8Array([1]) });

    expect(res).toEqual({ success: false, error: "quota exceeded" });
  });

  it("deletes media from the global upload path", async () => {
    const contents = new InMemoryGithubContents();
    contents.seedFile("public/uploads/hero.webp", "bytes");
    const media = new GitHubMediaAdapter(contents);

    expect(await media.deleteMedia("hero.webp")).toMatchObject({ success: true });
    expect(contents.has("public/uploads/hero.webp")).toBe(false);
    expect(contents.commits[0].message).toBe("media(global): delete hero.webp");
  });
});
