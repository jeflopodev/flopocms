# Admin UI Served from the CMS Package

Admin pages and API routes live in `packages/cms/src/routes/` and reach each site through an Astro integration's `injectRoute`, with `sites/*` keeping only site chrome, content, config, and a three-line middleware delegation — so the repo split is a package publish plus a version bump, not a file move.

## Status
Accepted

## Context
ADR-0013 split the repo into `packages/cms` and `sites/*` but left admin pages physically in the site because Astro requires `src/pages`, deferring the `injectRoute` conversion to repo-split day. Every admin page already imported only `cms/*` and `blocks/*` (layouts, services, editor scripts), except two that compose site chrome: login renders inside the site `RootLayout` (header and footer), and the draft preview renders inside it.

## Decision
1. `packages/cms` owns the admin pages and `/api/admin/*` routes under `src/routes/` — except the two site-chrome exceptions below — plus a `cmsAdmin()` Astro integration that injects each route at its existing pattern; URLs, guards and behavior are unchanged.
2. Login and the draft preview stay site-owned as the documented exceptions: both compose the site's own page shell (header, footer) around CMS-owned content, which is site chrome by definition. The middleware's `/admin/login` carve-out is path-based and unaffected.
3. The edge middleware guard moves to `cms/middleware`; each site keeps a thin `src/middleware.ts` delegating to it, because Astro resolves middleware from the site project, not from an integration.

## Considered Options
- Keeping admin pages in sites until the repo split: rejected, every CMS admin change would still touch site checkouts and the split would stay a flag day.
- Parameterizing the site-chrome layouts through integration options: rejected, a dynamic site-component import is fragile indirection around two small files whose site-ownership is honest.

## Consequences
- A second site registers `cmsAdmin()` and gets the whole dashboard; per-site differences remain env vars (`CONTENT_DIR`, `UPLOADS_DIR`, D1, PAT, domain), never code.
- The toolbar contract test reads the editor page from its CMS path; at repo-split it moves with the page, as its comment always said.
