/**
 * Upload rules for the Asset Registry that both sides of the wire must agree on.
 *
 * The server enforces these when it accepts a file; the editor and the Asset Library warn
 * with them before spending a request. They live apart from `asset-registry.ts` because
 * that module opens a database connection and so cannot be imported by a browser script —
 * which is how the 2 MB / 25 MB verdict came to be written out in four places.
 *
 * This module must stay dependency-free: no database, no Node built-ins, no `astro:`
 * imports, or it stops being importable from the client, which is the whole point.
 *
 * It also owns the raster→WebP canonicalization rule: which uploads the pipeline
 * stores as WebP (`isConvertibleRaster`) and what the stored name becomes
 * (`webpFilenameFor`). The browser pre-encodes before spending a request and the
 * server enforces after receiving one; both read the same sets here.
 */

export const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2 MB
export const MAX_NON_IMAGE_SIZE = 25 * 1024 * 1024; // 25 MB

/** The canonical upload encoding for raster originals. */
export const WEBP_MIME = "image/webp";
export const WEBP_EXTENSION = ".webp";
/** Quality both converters target (sharp `quality`, canvas `toBlob` alpha). */
export const WEBP_QUALITY = 82;

/**
 * Raster originals the upload pipeline canonicalizes to WebP before storage:
 * JPEG, PNG, BMP and TIFF. Deliberately absent:
 * - AVIF and WebP pass through (AVIF is typically smaller than WebP),
 * - GIF passes through (conversion would drop animation to one frame),
 * - SVG passes through (a vector, not a raster).
 */
export const CONVERTIBLE_RASTER_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/bmp",
  "image/tiff",
]);

export const CONVERTIBLE_RASTER_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".bmp",
  ".tif",
  ".tiff",
]);

/** The one rule for what counts as an image. */
export function isImageMime(mimeType: string | null | undefined): boolean {
  return Boolean(mimeType && mimeType.startsWith("image/"));
}

export function maxBytesFor(mimeType: string | null | undefined): number {
  return isImageMime(mimeType) ? MAX_IMAGE_SIZE : MAX_NON_IMAGE_SIZE;
}

/** The limit as a person reads it, for a message shown to an editor. */
export function maxSizeLabel(mimeType: string | null | undefined): string {
  return isImageMime(mimeType) ? "2 MB" : "25 MB";
}

/** Whether this upload is a raster original the pipeline stores as WebP. */
export function isConvertibleRaster(input: {
  mimeType?: string | null;
  filename?: string | null;
}): boolean {
  const mime = (input.mimeType || "").toLowerCase().split(";")[0].trim();
  if (mime && CONVERTIBLE_RASTER_MIMES.has(mime)) return true;

  const name = input.filename || "";
  const dot = name.lastIndexOf(".");
  if (dot !== -1) {
    const ext = name.slice(dot).toLowerCase();
    if (CONVERTIBLE_RASTER_EXTENSIONS.has(ext)) return true;
  }

  return false;
}

/** The stored name of a converted upload: same basename, `.webp` extension. */
export function webpFilenameFor(filename: string): string {
  const name = filename || "upload.bin";
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}${WEBP_EXTENSION}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 KB";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export interface SizeVerdict {
  ok: boolean;
  /** Why the file was refused, ready to show. Absent when `ok`. */
  reason?: string;
}

/**
 * Whether a file may be uploaded, and if not, the sentence to show the editor. Called by
 * the server before it spends a write, and by the browser before it spends a request.
 */
export function sizeVerdictFor(input: {
  mimeType?: string | null;
  byteSize: number;
  filename?: string;
}): SizeVerdict {
  if (input.byteSize <= maxBytesFor(input.mimeType)) return { ok: true };

  const name = input.filename ? `"${input.filename}" ` : "";
  return {
    ok: false,
    reason: `File ${name}is ${formatBytes(input.byteSize)}, over the ${maxSizeLabel(input.mimeType)} limit.`,
  };
}
