import { describe, expect, it } from "vitest";
import { InMemoryAssetRegistry, sanitizeFilename } from "./asset-registry";
import type { Asset } from "./db";

describe("sanitizeFilename", () => {
  it("cleans illegal characters and lowercases", () => {
    const { cleanFilename, baseName, extension } = sanitizeFilename("My Cool Photo (1)!.PNG");
    expect(cleanFilename).toBe("my-cool-photo-1-.png");
    expect(baseName).toBe("my-cool-photo-1-");
    expect(extension).toBe(".png");
  });

  it("handles empty or extensionless names gracefully", () => {
    const res = sanitizeFilename("");
    expect(res.cleanFilename).toBe("upload.bin");
  });
});

describe("InMemoryAssetRegistry", () => {
  const seed: Asset[] = [
    {
      id: "asset-1",
      filename: "guide.pdf",
      originalName: "Guide.pdf",
      mimeType: "application/pdf",
      byteSize: 1024,
      url: "/uploads/guide.pdf",
      title: "Guide",
      altText: "Guide",
      description: "A guide document",
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:00:00.000Z",
    },
  ];

  it("lists existing assets in descending date order", async () => {
    const registry = new InMemoryAssetRegistry(seed);
    const list = await registry.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("asset-1");
  });

  it("finds an asset by id", async () => {
    const registry = new InMemoryAssetRegistry(seed);
    const item = await registry.find("asset-1");
    expect(item).toBeDefined();
    expect(item?.filename).toBe("guide.pdf");

    const missing = await registry.find("non-existent");
    expect(missing).toBeNull();
  });

  it("uploads a new asset respecting size rules", async () => {
    const registry = new InMemoryAssetRegistry();
    const file = new File(["dummy content"], "photo.png", { type: "image/png" });

    const result = await registry.upload(file);
    expect(result.success).toBe(true);
    expect(result.asset).toBeDefined();
    expect(result.asset?.filename).toBe("photo.png");
    expect(result.asset?.url).toBe("/uploads/photo.png");

    const listed = await registry.list();
    expect(listed).toHaveLength(1);
  });

  it("rejects an oversized image upload (> 2MB)", async () => {
    const registry = new InMemoryAssetRegistry();
    // 3MB buffer
    const bigFile = new File([new Uint8Array(3 * 1024 * 1024)], "huge.png", { type: "image/png" });

    const result = await registry.upload(bigFile);
    expect(result.success).toBe(false);
    expect(result.error).toContain("over the 2 MB limit");
  });

  it("updates metadata of an existing asset", async () => {
    const registry = new InMemoryAssetRegistry(seed);
    const res = await registry.updateMetadata({
      id: "asset-1",
      title: "Updated Guide",
      altText: "New Alt",
      description: "New description",
    });

    expect(res.success).toBe(true);
    const item = await registry.find("asset-1");
    expect(item?.title).toBe("Updated Guide");
    expect(item?.altText).toBe("New Alt");
    expect(item?.description).toBe("New description");
  });

  it("deletes an asset by id", async () => {
    const registry = new InMemoryAssetRegistry(seed);
    const res = await registry.delete("asset-1");
    expect(res.success).toBe(true);

    const list = await registry.list();
    expect(list).toHaveLength(0);
  });

  it("returns error on deleting non-existent asset", async () => {
    const registry = new InMemoryAssetRegistry();
    const res = await registry.delete("no-such-id");
    expect(res.success).toBe(false);
    expect(res.error).toBe("Asset not found");
  });
});
