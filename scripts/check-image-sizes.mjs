#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB
const IMAGE_EXTENSIONS = new Set([
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

const SEARCH_DIRS = [
  path.join(process.cwd(), "src", "content", "blog"),
  path.join(process.cwd(), "src", "assets"),
];

function formatBytes(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function findImages(dir) {
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

function main() {
  console.log("Checking image asset sizes (max 2MB guardrail)...");

  const allImages = SEARCH_DIRS.flatMap(findImages);
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

  if (oversized.length > 0) {
    console.error("\n[!] Image Guardrail Violation: The following source image(s) exceed the 2MB limit:\n");
    for (const item of oversized) {
      console.error(`  - ${item.file}: ${formatBytes(item.size)} (limit: 2.00 MB)`);
    }
    console.error("\nTo maintain repository health and prevent Git bloat:");
    console.error("  1. Compress or resize the image before committing.");
    console.error("  2. Convert heavy PNG/JPEGs to WebP or AVIF.");
    console.error("  3. Astro's <Image /> component handles responsive srcset at build time.\n");
    process.exit(1);
  }

  console.log(`[✓] All ${allImages.length} image asset(s) are within the 2MB size limit.`);
}

main();
