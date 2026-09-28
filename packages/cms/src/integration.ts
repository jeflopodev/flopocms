import type { AstroIntegration } from "astro";
import { registerCustomBlocks } from "blocks/registry";
import { type CmsConfig, setCmsConfig } from "./config";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

/**
 * Serves the CMS-owned editorial surfaces (`/admin`, `/api/admin`) from this
 * package into whichever site registers the integration.
 *
 * Accepts optional site-specific CmsConfig to register custom blocks, settings,
 * themes, and site metadata.
 *
 * The draft preview (`/admin/posts/[id]/preview`) and the sign-in page
 * (`/admin/login`) are deliberately absent: both compose the site's own page
 * shell around CMS-owned content, which is site chrome by definition, so they
 * stay site-owned files (see ADR-0016).
 * Everything injected here renders identically on every site; per-site
 * differences arrive as env vars (`CONTENT_DIR`, `UPLOADS_DIR`, D1, PAT),
 * never as code.
 */
export function cmsAdmin(siteConfig?: CmsConfig): AstroIntegration {
  if (siteConfig) {
    setCmsConfig(siteConfig);
    if (siteConfig.blocks && siteConfig.blocks.length > 0) {
      registerCustomBlocks(siteConfig.blocks);
    }
  }

  const routes: Array<{ pattern: string; entrypoint: string }> = [
    { pattern: "/admin", entrypoint: "cms/routes/admin/index.astro" },
    { pattern: "/admin/posts", entrypoint: "cms/routes/admin/posts/index.astro" },
    { pattern: "/admin/posts/new", entrypoint: "cms/routes/admin/posts/new.astro" },
    { pattern: "/admin/posts/[id]", entrypoint: "cms/routes/admin/posts/[id].astro" },
    { pattern: "/admin/assets", entrypoint: "cms/routes/admin/assets/index.astro" },
    { pattern: "/admin/profile", entrypoint: "cms/routes/admin/profile.astro" },
    { pattern: "/api/admin/logout", entrypoint: "cms/routes/api/admin/logout.ts" },
    { pattern: "/api/admin/session", entrypoint: "cms/routes/api/admin/session.ts" },
    { pattern: "/api/admin/assets/upload", entrypoint: "cms/routes/api/admin/assets/upload.ts" },
    { pattern: "/api/admin/assets/update", entrypoint: "cms/routes/api/admin/assets/update.ts" },
    { pattern: "/api/admin/assets/delete", entrypoint: "cms/routes/api/admin/assets/delete.ts" },
    { pattern: "/api/admin/posts/save", entrypoint: "cms/routes/api/admin/posts/save.ts" },
    { pattern: "/api/admin/posts/lock", entrypoint: "cms/routes/api/admin/posts/lock.ts" },
    { pattern: "/api/admin/posts/duplicate", entrypoint: "cms/routes/api/admin/posts/duplicate.ts" },
    { pattern: "/api/admin/posts/delete", entrypoint: "cms/routes/api/admin/posts/delete.ts" },
    {
      pattern: "/api/admin/profile/change-password",
      entrypoint: "cms/routes/api/admin/profile/change-password.ts",
    },
    {
      pattern: "/api/admin/profile/sessions/end",
      entrypoint: "cms/routes/api/admin/profile/sessions/end.ts",
    },
    {
      pattern: "/api/admin/profile/sessions/end-all",
      entrypoint: "cms/routes/api/admin/profile/sessions/end-all.ts",
    },
  ];

  return {
    name: "cms-admin",
    hooks: {
      "astro:config:setup": ({ injectRoute, updateConfig, config }) => {
        for (const route of routes) injectRoute(route);

        let resolvedConfigImport = "";
        try {
          const rootDir = fileURLToPath(config.root);
          for (const ext of [".ts", ".js", ".mjs"]) {
            const candidate = path.join(rootDir, `cms.config${ext}`);
            if (fs.existsSync(candidate)) {
              resolvedConfigImport = candidate.replace(/\\/g, "/");
              break;
            }
          }
        } catch (e) {
          console.warn("Failed to resolve cms.config for runtime init:", e);
        }

        updateConfig({
          vite: {
            plugins: [
              {
                name: "cms-runtime-init",
                resolveId(id: string) {
                  if (id === "virtual:cms-init") {
                    return "\0virtual:cms-init";
                  }
                },
                load(id: string) {
                  if (id === "\0virtual:cms-init") {
                    if (resolvedConfigImport) {
                      return `
import siteConfig from "${resolvedConfigImport}";
import { registerCustomBlocks } from "blocks/registry";
if (siteConfig?.blocks && Array.isArray(siteConfig.blocks)) {
  registerCustomBlocks(siteConfig.blocks, true);
}
export default siteConfig;
`;
                    }
                    return `export default {};`;
                  }
                },
              },
            ],
          },
        });
      },
    },
  };
}
