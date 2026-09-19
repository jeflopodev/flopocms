import { eq } from "drizzle-orm";
import type { DbClient } from "./db";
import { assets, type Asset } from "./db";
import type { MediaStorage } from "./media-storage";

export const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2 MB
export const MAX_NON_IMAGE_SIZE = 25 * 1024 * 1024; // 25 MB

export interface RegisterAssetOptions {
  file: File;
  db: DbClient;
  storage: MediaStorage;
}

export interface RegisterAssetResult {
  success: boolean;
  asset?: Asset;
  snippet?: string;
  error?: string;
}

export interface DeleteAssetOptions {
  id: string;
  db: DbClient;
  storage: MediaStorage;
}

export interface DeleteAssetResult {
  success: boolean;
  error?: string;
}

export function sanitizeFilename(originalName: string): { cleanFilename: string; baseName: string; extension: string } {
  const name = originalName || "upload.bin";
  const extension = name.includes(".")
    ? "." + name.split(".").pop()?.toLowerCase()
    : "";
  const baseName = name
    .replace(/\.[^/.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);

  const cleanFilename = `${baseName}${extension}`;
  return { cleanFilename, baseName, extension };
}

/**
 * Registers an uploaded file in the Asset Registry:
 * Validates constraints, writes bytes to MediaStorage, and creates the D1 asset record.
 */
export async function registerAsset(options: RegisterAssetOptions): Promise<RegisterAssetResult> {
  const { file, db, storage } = options;

  if (!file) {
    return { success: false, error: "No file provided" };
  }

  const isImage = file.type.startsWith("image/");
  const maxAllowedSize = isImage ? MAX_IMAGE_SIZE : MAX_NON_IMAGE_SIZE;
  const maxAllowedLabel = isImage ? "2 MB" : "25 MB";

  if (file.size > maxAllowedSize) {
    return {
      success: false,
      error: `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the ${maxAllowedLabel} limit.`,
    };
  }

  const originalName = file.name || "upload.bin";
  const { cleanFilename, baseName } = sanitizeFilename(originalName);
  const fallbackTitle = baseName.replace(/-/g, " ");

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 1. Write to storage seam
  const storageResult = await storage.writeMedia({
    filename: cleanFilename,
    content: buffer,
    mimeType: file.type,
  });

  if (!storageResult.success) {
    return { success: false, error: storageResult.error || "Failed to write media to storage" };
  }

  const url = storageResult.url || `/uploads/${cleanFilename}`;
  const assetId = crypto.randomUUID();
  const now = new Date().toISOString();

  // 2. Insert metadata into D1 assets table
  const newAsset = {
    id: assetId,
    filename: cleanFilename,
    originalName,
    mimeType: file.type || "application/octet-stream",
    byteSize: file.size,
    url,
    title: fallbackTitle,
    altText: fallbackTitle,
    description: "",
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(assets).values(newAsset);

  const snippet = isImage
    ? `![${fallbackTitle}](${url})`
    : `<a href="${url}" download="${originalName}">${originalName}</a>`;

  return {
    success: true,
    asset: newAsset,
    snippet,
  };
}

/**
 * Atomically cleans up an asset by deleting the media from storage and removing the D1 record.
 */
export async function deleteAsset(options: DeleteAssetOptions): Promise<DeleteAssetResult> {
  const { id, db, storage } = options;

  if (!id) {
    return { success: false, error: "Missing asset ID" };
  }

  const [assetRecord] = await db
    .select()
    .from(assets)
    .where(eq(assets.id, id))
    .limit(1);

  if (!assetRecord) {
    return { success: false, error: "Asset not found" };
  }

  // 1. Delete from physical media storage
  await storage.deleteMedia(assetRecord.filename);

  // 2. Delete from D1 database
  await db.delete(assets).where(eq(assets.id, id));

  return { success: true };
}
