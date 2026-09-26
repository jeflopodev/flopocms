import type { AstroIntegration } from "astro";

/**
 * Serves the CMS-owned editorial surfaces (`/admin`, `/api/admin`) from this
 * package into whichever site registers the integration.
 *
 * The draft preview (`/admin/posts/[id]/preview`) and the sign-in page
 * (`/admin/login`) are deliberately absent: both compose the site's own page
 * shell around CMS-owned content, which is site chrome by definition, so they
 * stay site-owned files (see ADR-0016).
 * Everything injected here renders identically on every site; per-site
 * differences arrive as env vars (`CONTENT_DIR`, `UPLOADS_DIR`, D1, PAT),
 * never as code.
 */
export function cmsAdmin(): AstroIntegration {
  const routes: Array<{ pattern: string; entrypoint: string }> = [
    { pattern: "/admin", entrypoint: "cms/routes/admin/index.astro" },
    { pattern: "/admin/posts", entrypoint: "cms/routes/admin/posts/index.astro" },
    { pattern: "/admin/posts/new", entrypoint: "cms/routes/admin/posts/new.astro" },
    { pattern: "/admin/posts/[id]", entrypoint: "cms/routes/admin/posts/[id].astro" },
    { pattern: "/admin/assets", entrypoint: "cms/routes/admin/assets/index.astro" },
    { pattern: "/admin/profile", entrypoint: "cms/routes/admin/profile.astro" },
    { pattern: "/api/admin/logout", entrypoint: "cms/routes/api/admin/logout.ts" },
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
      "astro:config:setup": ({ injectRoute }) => {
        for (const route of routes) injectRoute(route);
      },
    },
  };
}
