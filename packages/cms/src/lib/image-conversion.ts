import { WEBP_MIME, WEBP_QUALITY, isConvertibleRaster, webpFilenameFor } from "blocks/asset-rules";

/**
 * Raster→WebP conversion on the server half of the upload pipeline.
 *
 * The browser pre-encodes before spending a request; this module is the retry
 * the server runs after receiving one. It must stay Workers-safe: `sharp` is a
 * native Node module that cannot bundle for Cloudflare Workers, so it is only
 * ever reached through a dynamic import that bundlers ignore and Workers fail
 * at runtime — where the caller turns that failure into a "send WebP" refusal
 * rather than a crash.
 */

export interface WebpConversionInput {
  bytes: Uint8Array | Buffer;
  filename: string;
}

export interface WebpConversion {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
}

export interface ImageConverter {
  convertToWebp(input: WebpConversionInput): Promise<WebpConversion>;
}

export const CONVERSION_UNAVAILABLE_ERROR =
  "Image conversion is unavailable in this runtime. Convert to WebP or AVIF before uploading.";

/** Whether a converter failure is "no runtime", mapping to a send-WebP refusal. */
export function isConversionUnavailable(message: string | null | undefined): boolean {
  return Boolean(message && message.includes("conversion is unavailable in this runtime"));
}

/** Whether this received file still needs server-side canonicalization. */
export function needsWebpConversion(input: {
  mimeType?: string | null;
  filename?: string | null;
}): boolean {
  return isConvertibleRaster(input);
}

function isNodeRuntime(): boolean {
  return typeof process !== "undefined" && Boolean(process.versions?.node);
}

/**
 * Converts raster bytes to WebP via `sharp`, loaded lazily so Workers builds
 * never bundle it. Throws `CONVERSION_UNAVAILABLE_ERROR` outside Node or when
 * `sharp` cannot be loaded — the caller reports that as a 400, not a 500.
 */
export async function convertBytesToWebp(input: WebpConversionInput): Promise<WebpConversion> {
  if (!isNodeRuntime()) {
    throw new Error(CONVERSION_UNAVAILABLE_ERROR);
  }

  try {
    const mod = await import(/* @vite-ignore */ "sharp");
    const sharp = (mod as any)?.default ?? mod;
    const out = await sharp(Buffer.from(input.bytes)).webp({ quality: WEBP_QUALITY }).toBuffer();
    return {
      bytes: new Uint8Array(out),
      filename: webpFilenameFor(input.filename),
      mimeType: WEBP_MIME,
    };
  } catch (err: any) {
    if (err?.message === CONVERSION_UNAVAILABLE_ERROR) throw err;
    throw new Error(`${CONVERSION_UNAVAILABLE_ERROR} (${err?.message || err})`);
  }
}

/**
 * The converter `Services` hands the Asset Registry. One method, one rule:
 * convert when `sharp` loads, refuse with a send-WebP message when it cannot.
 */
export class RuntimeImageConverter implements ImageConverter {
  convertToWebp(input: WebpConversionInput): Promise<WebpConversion> {
    return convertBytesToWebp(input);
  }
}
