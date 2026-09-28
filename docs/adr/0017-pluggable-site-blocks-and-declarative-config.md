# Pluggable Site Blocks and Declarative Configuration

Sites define their own custom blocks and runtime configuration in `cms.config.ts`, which the CMS integration discovers and registers dynamically via a Vite runtime injection seam (`virtual:cms-init`) — so sites can introduce new custom blocks, authors, templates, and settings without modifying the CMS core.

## Status
Accepted

## Context
ADR-0014 isolated blocks into `packages/blocks`, but auto-discovery was limited to standard blocks internal to the package via `import.meta.glob("./*/index.ts")`. Consumer sites could not define proprietary blocks (e.g. pricing cards, live polls, specialized product widgets) without touching the CMS monorepo. Furthermore, site-specific configuration (authors, templates, settings) lacked a unified declarative entrypoint.

## Decision
1. `packages/blocks/src/registry.ts` exposes `registerCustomBlocks(blocks, allowOverride)`, enabling external callers to register site-specific blocks alongside standard core blocks.
2. `packages/cms/src/config.ts` introduces a declarative `defineConfig(config: CmsConfig)` contract where each site declares its `siteName`, `contentDir`, `uploadsDir`, `authors`, `blocks`, `templates`, and `settings`.
3. `cmsAdmin(siteConfig)` in `packages/cms/src/integration.ts` registers a Vite virtual module (`virtual:cms-init`) that dynamically resolves the consumer site's `cms.config.ts` at build/SSR runtime and registers its custom blocks before `renderDocument` or the Admin editor executes.
4. Editorial surfaces (`/admin/posts/[id]`) automatically discover site custom blocks: `getEditorBlockCards()` renders cards in the Blocks drawer, and `getToolbarActions()` renders any block-declared toolbar actions.

## Considered Options
- **Hardcoding all blocks in core**: Rejected; violates the multi-tenant decoupling requirement where each site must have autonomous block definitions.
- **Requiring sites to manually invoke registration in every page**: Rejected; fragile and repetitive. The Astro integration's `virtual:cms-init` seam guarantees registration in every execution context (SSG build, Live Draft Preview, Admin UI).

## Consequences
- Sites can create and maintain proprietary custom blocks in `src/blocks/` with zero upstream changes to the CMS engine.
- Updating the CMS package (`@org/cms`) will never overwrite or interfere with site-specific custom blocks.
- The Blocks drawer and Document Renderer remain fully driven by data contracts rather than hardcoded lists.
