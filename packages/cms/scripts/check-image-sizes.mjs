#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB
export const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".avif",
  ".svg",
  ".bmp",
  ".tiff",
]);

/**
 * Image size guardrail, owned by the CMS package so every site shares one rule.
 *
 * Sites call the `cms-check-images` bin from their build (`astro build` never runs
 * without it). Directories come from argv so a second site passes its own content
 * and uploads dirs instead of forking the script; with no argv the script falls
 * back to the monorepo-phase layout relative to the caller's cwd.
 */
export function defaultSearchDirs(cwd = process.cwd()) {
  const candidates = [
    process.env.CONTENT_DIR,
    process.env.UPLOADS_DIR,
    path.join(cwd, "src", "content", "blog"),
    path.join(cwd, "src", "assets"),
    path.join(cwd, "public", "uploads"),
    path.join(cwd, "sites", "site-a", "src", "content", "blog"),
    path.join(cwd, "sites", "site-a", "public", "uploads"),
  ].filter(Boolean);

  const seen = new Set();
  return candidates.filter((dir) => {
    if (seen.has(dir)) return false;
    seen.add(dir);
    return fs.existsSync(dir);
  });
}

export function formatBytes(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

export function findImages(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (IMAGE_EXTENSIONS.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return results;
}

export function checkImageSizes(dirs) {
  const allImages = dirs.flatMap(findImages);
  const oversized = [];

  for (const file of allImages) {
    const stat = fs.statSync(file);
    if (stat.size > MAX_IMAGE_BYTES) {
      oversized.push({
        file: path.relative(process.cwd(), file),
        size: stat.size,
      });
    }
  }

  return { allImages, oversized };
}

function main() {
  const argvDirs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const dirs = argvDirs.length > 0 ? argvDirs : defaultSearchDirs();

  console.log("Checking image asset sizes (max 2MB guardrail)...");

  const { allImages, oversized } = checkImageSizes(dirs);

  if (oversized.length > 0) {
    console.error("\n[!] Image Guardrail Violation: The following source image(s) exceed the 2MB limit:\n");
    for (const item of oversized) {
      console.error(`  - ${item.file}: ${formatBytes(item.size)} (limit: 2.00 MB)`);
    }
    console.error("\nTo maintain repository health and prevent Git bloat:");
    console.error("  1. Compress or resize the image before committing.");
    console.error("  2. Uploads already convert heavy PNG/JPEG/BMP/TIFF to WebP; AVIF and WebP pass through.");
    console.error("  3. Astro's <Image /> component handles responsive srcset at build time.\n");
    process.exit(1);
  }

  console.log(`[✓] All ${allImages.length} image asset(s) are within the 2MB size limit.`);
}

main();
