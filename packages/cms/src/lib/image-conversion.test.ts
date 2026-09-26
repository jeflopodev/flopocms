import { describe, expect, it } from "vitest";
import { needsWebpConversion } from "./image-conversion";

describe("needsWebpConversion", () => {
  it("requires conversion for raster originals", () => {
    expect(needsWebpConversion({ mimeType: "image/png", filename: "photo.png" })).toBe(true);
    expect(needsWebpConversion({ mimeType: "image/jpeg", filename: "photo.jpg" })).toBe(true);
  });

  it("does not require conversion for AVIF, WebP, GIF, SVG or files", () => {
    expect(needsWebpConversion({ mimeType: "image/avif", filename: "hero.avif" })).toBe(false);
    expect(needsWebpConversion({ mimeType: "image/webp", filename: "hero.webp" })).toBe(false);
    expect(needsWebpConversion({ mimeType: "image/gif", filename: "salmon.gif" })).toBe(false);
    expect(needsWebpConversion({ mimeType: "image/svg+xml", filename: "logo.svg" })).toBe(false);
    expect(needsWebpConversion({ mimeType: "application/pdf", filename: "guide.pdf" })).toBe(false);
  });
});
