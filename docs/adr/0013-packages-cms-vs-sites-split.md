# Packages CMS vs Sites Split

The repo is a pnpm workspace with `packages/cms` (all domain code, zero real content) and `sites/site-a` (content, chrome, config, deploys); sites import `cms/*`, never the reverse — so CMS feature work stops dragging site content along, and the later repo split is mechanical file moves plus `injectRoute` for admin pages.

## Status
Accepted

## Context
Code and content shared one repo, branch, and build: every CMS feature branch carried content history and every content commit rebuilt CMS code. Two sites on this CMS need independent content with a shared, versioned platform.

## Decision
1. `packages/cms` owns lib, blocks, db, templates, admin shell, editor, content factory, migrations, and bins; it ships no real content and no site config.
2. `sites/*` owns pages, middleware, layouts/chrome, content bundles, uploads, astro/wrangler config, and secrets; per-site D1, Worker, PAT, and domain.
3. The boundary rule is one-directional imports, enforced by build: article rendering split into cms-owned `article-fragment.astro` and site-owned `RootLayout`, with JSON-LD riding in the body where it is valid.
4. Repo split later: fresh CMS repo from `packages/cms`, site repos depending on it by git tag; admin pages convert to `injectRoute` entrypoints then, not now.

## Considered Options
- Multi-tenant single deployment: rejected, one Worker serves one static build and per-site auth scoping is unwarranted at two sites.
- Branch-per-site: rejected, history and clones stay shared.
- Immediate repo split: deferred, the in-place split proves the boundary while everything still builds here.

## Consequences
- Content commits build one site; CMS changes build all sites; upgrades are explicit version bumps.
- Same two editors get separate accounts per site D1; sessions stay per-domain.
- `migrations_dir` in each site's wrangler config points at the CMS package; the deploy projector runs from the site checkout.
