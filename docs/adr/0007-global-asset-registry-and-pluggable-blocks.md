# Global Asset Registry, Pluggable Blocks, and Isolated Templates

## Status
Accepted (Supersedes [ADR-0006](file:///e:/repos/astro/blog/docs/adr/0006-global-mdx-components-and-git-asset-sync.md) regarding co-located media)

## Context
Previously, ADR-0006 required media assets to be co-located within each article's Git bundle path (`src/content/blog/<slug>/`). While effective for isolated article folders, this caused duplicate media uploads when images or downloads needed to be reused across multiple articles, prevented non-article media usage, and complicated asset referencing in custom components like `<AmazonProduct>`.

Furthermore, custom components were hardcoded across the editor UI, auto-import configurations, and AST schema extractors, making it difficult to maintain clean boundaries or introduce database-dependent components.

## Decision

1. **Global Asset Registry**:
   - Media assets are stored centrally in `public/uploads/` rather than within individual post folders.
   - Assets are tracked globally in the Cloudflare D1 `assets` table via Drizzle ORM, with fields for metadata (`title`, `alt_text`, `description`, `mime_type`, `byte_size`, `url`).
   - File size limits: 2 MiB for raster/vector images; **25 MiB** for rich media (videos, archives, documents).
   - In production Workers, uploads commit to `public/uploads/<cleanFilename>` on GitHub `main` branch. In development, files are written directly to local disk.

2. **Pluggable & Self-Contained Custom Blocks**:
   - Components are isolated under `src/blocks/<block-name>/`:
     - Component markup (`.astro`)
     - Props validation schema powered by `valibot` (`schema.ts`)
     - Block descriptor (`index.ts`) providing name, icon, and snippet templates for the editor drawer.
   - Central registry (`src/blocks/index.ts`) drives ambient auto-imports and editor drawer UI dynamically.
   - Blocks can access Cloudflare D1 via Drizzle (e.g., `RelatedPosts` querying by tags or categories).

3. **Isolated Post Templates**:
   - Post layout templates are isolated in `src/templates/` (e.g. `default.astro`, `two-column.astro`, `index.ts`).
   - Content is strictly maintained within `main > article`.
   - The two-column template renders `main > article | aside`, providing an empty aside ready for custom components.

4. **URL Slug Automation**:
   - Slugs are automatically computed in real time from article titles using `slugify`.
