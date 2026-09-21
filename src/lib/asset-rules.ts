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
 */

export const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2 MB
export const MAX_NON_IMAGE_SIZE = 25 * 1024 * 1024; // 25 MB

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
