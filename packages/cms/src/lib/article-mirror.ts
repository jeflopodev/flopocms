/**
 * Local Article mirror.
 *
 * In local development the Astro content collection reads Post Bundles from disk, so a
 * save has to land there as well as in D1. On Workers there is no filesystem: production
 * reads the bundle that was committed to `main`, so the mirror does nothing.
 *
 * It is a seam rather than an inline `import("node:fs")` so that Post Lifecycle touches
 * no filesystem at all, and so a test can never write into the source tree.
 */

/**
 * Where Post Bundles live on local disk, relative to the process working directory.
 * Local development runs from the site directory, so this stays checkout-relative;
 * GitHub paths on `main` come from `Services.contentDir` instead (per site).
 */
export const BLOG_DIR = "src/content/blog";

export interface ArticleMirror {
  write(slug: string, mdx: string): Promise<void>;
  remove(slug: string): Promise<void>;
}

export function createLocalArticleMirror(): ArticleMirror {
  const hasFilesystem = (): boolean => typeof process !== "undefined" && Boolean(process.versions?.node);

  return {
    async write(slug, mdx) {
      if (!hasFilesystem()) return;

      try {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const baseDir = path.resolve(process.cwd(), BLOG_DIR);
        const targetDir = path.resolve(baseDir, slug);

        if (!targetDir.startsWith(baseDir) || targetDir === baseDir) return;

        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        fs.writeFileSync(path.join(targetDir, "index.mdx"), mdx, "utf-8");
      } catch (err) {
        console.warn("Local Article mirror write warning:", err);
      }
    },

    async remove(slug) {
      if (!hasFilesystem()) return;

      try {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const baseDir = path.resolve(process.cwd(), BLOG_DIR);
        const bundleDir = path.resolve(baseDir, slug);

        if (bundleDir.startsWith(baseDir) && bundleDir !== baseDir && fs.existsSync(bundleDir)) {
          fs.rmSync(bundleDir, { recursive: true, force: true });
        }

        // Flat files from before Post Bundles existed
        for (const ext of [".mdx", ".md"]) {
          const flatFile = path.resolve(baseDir, `${slug}${ext}`);
          if (flatFile.startsWith(baseDir) && fs.existsSync(flatFile)) {
            fs.unlinkSync(flatFile);
          }
        }
      } catch (err) {
        console.warn("Local Article mirror delete warning:", err);
      }
    },
  };
}

/** No filesystem at all: Workers, and every test. */
export function createNoopArticleMirror(): ArticleMirror {
  return {
    write: async () => {},
    remove: async () => {},
  };
}
