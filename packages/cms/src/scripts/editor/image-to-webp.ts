import { WEBP_MIME, WEBP_QUALITY, isConvertibleRaster, webpFilenameFor } from "blocks/asset-rules";

/**
 * Browser half of the raster→WebP pipeline.
 *
 * Runs before the queue spends a request: convertible rasters (JPEG/PNG/BMP/TIFF)
 * are decoded and re-encoded to WebP so storage never sees the original bytes and
 * the 2 MB verdict judges the smaller file. AVIF, WebP, GIF and SVG pass through
 * untouched. Every failure path returns the original file — the server is the
 * retry, refusing convertibles it cannot re-encode itself with a send-WebP message.
 *
 * Browser-only: `createImageBitmap`, `document` and canvas. Never imported by
 * server modules or unit tests.
 */

/** Whether this file should be pre-encoded before POST. */
export function shouldPreEncodeToWebp(file: File): boolean {
  return isConvertibleRaster({ mimeType: file.type, filename: file.name });
}

/** Decodes a raster file and re-encodes it as WebP, or returns the original. */
export async function convertRasterToWebp(file: File): Promise<File> {
  if (!shouldPreEncodeToWebp(file)) return file;

  try {
    if (typeof createImageBitmap === "undefined") return file;
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, WEBP_MIME, WEBP_QUALITY / 100)
      );
      if (!blob) return file;
      return new File([blob], webpFilenameFor(file.name), { type: WEBP_MIME });
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}
