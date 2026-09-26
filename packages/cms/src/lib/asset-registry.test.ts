import { describe, expect, it } from "vitest";
import { InMemoryAssetRegistry, registerAsset, sanitizeFilename } from "./asset-registry";
import { CONVERSION_UNAVAILABLE_ERROR } from "./image-conversion";
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
    // Raster originals are canonicalized: never stored as themselves.
    expect(result.asset?.filename).toBe("photo.webp");
    expect(result.asset?.mimeType).toBe("image/webp");
    expect(result.asset?.url).toBe("/uploads/photo.webp");
    // Provenance stays: the original name is what the editor picked.
    expect(result.asset?.originalName).toBe("photo.png");

    const listed = await registry.list();
    expect(listed).toHaveLength(1);
  });

  it("passes AVIF through without canonicalization", async () => {
    const registry = new InMemoryAssetRegistry();
    const file = new File(["dummy content"], "hero.avif", { type: "image/avif" });

    const result = await registry.upload(file);
    expect(result.success).toBe(true);
    expect(result.asset?.filename).toBe("hero.avif");
    expect(result.asset?.mimeType).toBe("image/avif");
  });

  it("refuses a convertible raster when the converter cannot run", async () => {
    const registry = new InMemoryAssetRegistry([], {
      convertToWebp: async () => {
        throw new Error("Image conversion is unavailable in this runtime.");
      },
    });
    const file = new File(["dummy content"], "photo.jpg", { type: "image/jpeg" });

    const result = await registry.upload(file);
    expect(result.success).toBe(false);
    expect(result.error).toContain("WebP or AVIF");
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

describe("registerAsset raster→WebP canonicalization", () => {
  const stubDb = () => ({ insert: () => ({ values: async () => {} }) }) as any;

  const stubStorage = (seen: { filename?: string; mimeType?: string; size?: number }) => ({
    writeMedia: async (file: { filename: string; content: Uint8Array; mimeType?: string }) => {
      seen.filename = file.filename;
      seen.mimeType = file.mimeType;
      seen.size = file.content.length;
      return { success: true, url: `/uploads/${file.filename}` };
    },
    deleteMedia: async () => ({ success: true }),
  });

  it("re-encodes a PNG to WebP bytes before storage", async () => {
    const seen: { filename?: string; mimeType?: string; size?: number } = {};
    const result = await registerAsset({
      file: new File([new Uint8Array([1, 2, 3, 4])], "photo.png", { type: "image/png" }),
      db: stubDb(),
      storage: stubStorage(seen) as any,
      images: {
        convertToWebp: async ({ filename }) => ({
          bytes: new Uint8Array([9, 9]),
          filename: filename.replace(/\.png$/, ".webp"),
          mimeType: "image/webp",
        }),
      },
    });

    expect(result.success).toBe(true);
    expect(seen.filename).toBe("photo.webp");
    expect(seen.mimeType).toBe("image/webp");
    expect(seen.size).toBe(2);
    expect(result.asset?.filename).toBe("photo.webp");
    expect(result.asset?.mimeType).toBe("image/webp");
    expect(result.asset?.byteSize).toBe(2);
    expect(result.asset?.originalName).toBe("photo.png");
  });

  it("refuses a convertible raster without a converter (Workers)", async () => {
    const result = await registerAsset({
      file: new File(["dummy"], "photo.jpg", { type: "image/jpeg" }),
      db: stubDb(),
      storage: stubStorage({}) as any,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("WebP or AVIF");
  });

  it("maps a converter outage to a send-WebP refusal, not a crash", async () => {
    const result = await registerAsset({
      file: new File(["dummy"], "scan.tiff", { type: "image/tiff" }),
      db: stubDb(),
      storage: stubStorage({}) as any,
      images: {
        convertToWebp: async () => {
          throw new Error(CONVERSION_UNAVAILABLE_ERROR);
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("WebP or AVIF");
  });
});
