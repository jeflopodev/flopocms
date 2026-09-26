import { describe, expect, it } from "vitest";
import { isConvertibleRaster, webpFilenameFor } from "./asset-rules";

describe("isConvertibleRaster", () => {
  it("flags JPEG, PNG, BMP and TIFF originals by mime", () => {
    for (const mime of ["image/jpeg", "image/png", "image/bmp", "image/tiff"]) {
      expect(isConvertibleRaster({ mimeType: mime, filename: "photo.bin" })).toBe(true);
    }
  });

  it("flags convertible originals by extension when the mime is missing", () => {
    expect(isConvertibleRaster({ filename: "photo.JPG" })).toBe(true);
    expect(isConvertibleRaster({ filename: "scan.tif" })).toBe(true);
  });

  it("passes AVIF, WebP, GIF and SVG through", () => {
    expect(isConvertibleRaster({ mimeType: "image/avif", filename: "hero.avif" })).toBe(false);
    expect(isConvertibleRaster({ mimeType: "image/webp", filename: "hero.webp" })).toBe(false);
    expect(isConvertibleRaster({ mimeType: "image/gif", filename: "salmon.gif" })).toBe(false);
    expect(isConvertibleRaster({ mimeType: "image/svg+xml", filename: "logo.svg" })).toBe(false);
  });

  it("leaves non-images alone", () => {
    expect(isConvertibleRaster({ mimeType: "video/mp4", filename: "clip.mp4" })).toBe(false);
    expect(isConvertibleRaster({ mimeType: "application/pdf", filename: "guide.pdf" })).toBe(false);
  });
});

describe("webpFilenameFor", () => {
  it("swaps the extension for .webp, keeping the basename", () => {
    expect(webpFilenameFor("My Photo.JPG")).toBe("My Photo.webp");
    expect(webpFilenameFor("scan.tiff")).toBe("scan.webp");
  });

  it("appends .webp when there is no extension", () => {
    expect(webpFilenameFor("upload")).toBe("upload.webp");
  });
});
