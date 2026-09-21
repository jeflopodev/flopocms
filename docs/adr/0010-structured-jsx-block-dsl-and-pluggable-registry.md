# Structured JSX Block DSL and Pluggable Block Registry

## Status
Accepted (Supersedes [ADR-0002](file:///e:/repos/astro/blog/docs/adr/0002-satteri-ast-jsonld-schema-extraction.md) regarding AST extraction and Markdown parsing)

## Context
Previously, post content relied on Markdown/MDX syntax parsed with regular expressions in SSR preview routes, while component metadata extraction relied on compile-time Sätteri MDAST plugins. This introduced severe fragility:
1. Preview rendering diverged from production builds, producing malformed grid layouts and broken preview states.
2. Component definitions (props validation, rendering, styling, server data fetching, and JSON-LD schema synthesis) were scattered across separate files (`preview.astro`, `satteri-schema-extractor.mjs`, `modal-controller.ts`, etc.).
3. Markdown syntax lacks semantic structure for complex nested blocks, stretch breakouts, and typed props.

## Decision

1. **Purge Markdown & Regex Parsing**:
   Markdown syntax (`#`, `**`, `*`, `> `, `[text](url)`) and regular expression content parsing are eliminated entirely from the document architecture.

2. **Notion-like Structured Block Model**:
   Documents are represented as a tree of typed blocks (`BlockNode<TProps>[]`). Each block has:
   - Unique node ID
   - Canonical type identifier (`paragraph`, `heading`, `callout`, `youtube`, `amazon-product`, `list`, `quote`, `code`, `related-posts`, `schema`, `image`)
   - Strongly-typed props validated through Valibot schemas
   - Structured inline spans with Marks (`bold`, `italic`, `strike`, `code`, `underline`) and Mark Refs (`link` with `href`, `target`, `rel`).

3. **Human-Friendly JSX-like DSL**:
   Content is authored and stored in an unambiguous JSX DSL:
   - Block tags: `<Paragraph>`, `<Heading level={2}>`, `<Callout variant="note">`, `<YouTube id="..." stretch="wide" />`, etc.
   - Inline marks: `<Bold>`, `<Italic>`, `<Strike>`, `<Code>`, `<Link href="...">`.

4. **Self-Contained & Autoregistered Block Modules**:
   Every block under `src/blocks/<name>/` implements `BlockDefinition<TProps, TData>`:
   - **Schema**: Valibot schema defining typed props.
   - **Renderer**: Self-contained HTML generator.
   - **Styles**: Encapsulated CSS aggregated automatically by the registry.
   - **Server Data Fetcher**: Optional `loadServerData(props, ctx)` for asynchronous runtime data (e.g. `RelatedPosts` querying D1).
   - **JSON-LD Generator**: Optional `generateJsonLd(props, data)` for self-contained Schema.org entity synthesis (`Product`, `VideoObject`, etc.).
   - **Editor Metadata**: Label, icon, category, and insertion snippet.

5. **Unified Document Rendering Engine**:
   A deterministic, zero-regex parser and document renderer (`src/blocks/dsl/renderer.ts`) powers both **Live Draft Preview** (`/admin/posts/[id]/preview.astro`) and **Production Article Rendering** (`/blog/[...slug].astro`), guaranteeing 100% visual and structural parity.

## Amendment (2026-09-21)

Decision 1's purge is complete in the tree. The `.astro` block components that the auto-import kept resolving, the auto-import itself, and the Sätteri processor with its schema-extractor plugin are deleted; article HTML is byte-identical before and after, which is how the residue was identified. A block is described in exactly one place, its `BlockDefinition` under `src/blocks/<name>/`, and no configuration lists blocks a second time.

One addition to decision 2's Mark Refs: a `link` carries an optional `download` alongside `href`, `target` and `rel`. Without it a non-image **Asset Insertion** could not keep the uploaded file's name, and the parser's link branch discarded the attribute silently. Raw `<a>` remains an accepted alias for `<Link>`.
