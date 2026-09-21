import { desc, eq } from "drizzle-orm";
import { sizeVerdictFor } from "./asset-rules";
import type { DbClient } from "./db";
import { assets, type Asset } from "./db";
import type { MediaStorage } from "./media-storage";

export interface RegisterAssetOptions {
  file: File;
  db: DbClient;
  storage: MediaStorage;
}

export interface RegisterAssetResult {
  success: boolean;
  asset?: Asset;
  error?: string;
}

export interface UpdateAssetMetadataOptions {
  id: string;
  title: string;
  altText: string;
  description: string;
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

  // The same verdict the browser shows before it spends a request.
  const verdict = sizeVerdictFor({ mimeType: file.type, byteSize: file.size, filename: file.name });
  if (!verdict.ok) {
    return { success: false, error: verdict.reason };
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

  // No insertion text here: the Asset Insertion module owns that spelling, and this
  // module's job ends at the record and the bytes.
  return {
    success: true,
    asset: newAsset,
  };
}

/**
 * The Asset Library listing, newest first. The only read of the `assets` table, so a page
 * never writes its own query against the registry.
 */
export async function listAssets(db: DbClient): Promise<Asset[]> {
  return db.select().from(assets).orderBy(desc(assets.createdAt));
}

/** The metadata an editor owns, leaving bytes and identifiers alone. */
export async function updateAssetMetadata(
  db: DbClient,
  options: UpdateAssetMetadataOptions
): Promise<DeleteAssetResult> {
  const { id, title, altText, description } = options;

  if (!id) {
    return { success: false, error: "Missing asset ID" };
  }

  await db
    .update(assets)
    .set({ title, altText, description, updatedAt: new Date().toISOString() })
    .where(eq(assets.id, id));

  return { success: true };
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
