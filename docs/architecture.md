# Codebase Architecture

This document details the architectural principles, domain model, system boundaries, and core modules of the **blog-astro** publishing platform.

---

## 1. System Overview & Architectural Tenets

The system is a modern, high-performance publishing platform built on **Astro** and **Cloudflare Workers**. It unites a statically deployed public publication with a live, edge-rendered editorial administration dashboard, powered by Cloudflare D1 (SQLite at the edge) and the GitHub Contents REST API.

```mermaid
flowchart TB
    subgraph Readers["Public Web (Readers)"]
        PublicEdge["Cloudflare Workers & Static Assets"]
        PublicBlog["/blog/[...slug] (SSG)"]
        PublicIndex["/ (SSG)"]
    end

    subgraph Editorial["Editorial Dashboard (/admin)"]
        AdminUI["Admin & CodeMirror Workspace"]
        PreviewSSR["Live Draft Preview (/admin/posts/:id/preview)"]
        AdminAPI["API Routes (/api/admin/*)"]
    end

    subgraph Domain["Domain Core (Deep Modules)"]
        Lifecycle["Post Lifecycle\n(src/lib/post-lifecycle.ts)"]
        AssetReg["Asset Registry\n(src/lib/asset-registry.ts)"]
        DocRenderer["Document Renderer\n(src/blocks/dsl/renderer.ts)"]
        ReadModel["Article Read Model\n(src/lib/article.ts)"]
    end

    subgraph Seams["Services Seam (Ports & Adapters)"]
        Services["Services Interface (src/lib/services.ts)"]
        PostStoreSeam["PostStore"]
        LockStoreSeam["LockStore"]
        MediaSeam["MediaStorage"]
        ContentsSeam["GithubContents"]
        ClockSeam["Clock"]
    end

    subgraph Storage["Persistence & Authority"]
        D1[("Cloudflare D1 Database\n(Drafts, Locks, Assets, Users)")]
        GitHub[("GitHub Repository: main\n(src/content/blog/<slug>/index.mdx)")]
        MediaCDN["Media Storage\n(public/uploads/)"]
    end

    PublicBlog --> ReadModel
    ReadModel --> GitHub
    AdminAPI --> Lifecycle
    AdminAPI --> AssetReg
    PreviewSSR --> DocRenderer
    DocRenderer --> ReadModel
    PreviewSSR --> ReadModel

    Lifecycle --> Services
    AssetReg --> Services
    Services --> PostStoreSeam
    Services --> LockStoreSeam
    Services --> MediaSeam
    Services --> ContentsSeam
    Services --> ClockSeam

    PostStoreSeam --> D1
    LockStoreSeam --> D1
    ContentsSeam --> GitHub
    MediaSeam --> MediaCDN
```

### Key Tenets

1. **Dual Authority Model ([ADR-0011](file:///e:/repos/astro/blog/docs/adr/0011-published-article-authority.md), [ADR-0012](file:///e:/repos/astro/blog/docs/adr/0012-projector-owned-published-view-and-atomic-publishing.md))**:
   - **`main` is authoritative for published Article content and metadata**. The Git bundle (`src/content/blog/<slug>/index.mdx`) is the ultimate source of truth for readers.
   - **Cloudflare D1 is authoritative for Draft content and editorial state** (including pessimistic Concurrency Locks, editor accounts, and session tokens).
   - Published rows in D1 `posts` table are a disposable Published View of `main`, written only by the projector. Publishing lands bundle plus new assets in one atomic commit; convergence is a retrying loop (save-path fast-project plus deploy full-project), not a report.
2. **Deterministic Parity via Unified Document Renderer ([ADR-0010](file:///e:/repos/astro/blog/docs/adr/0010-structured-jsx-block-dsl-and-pluggable-registry.md))**:
   - Content is authored and stored in a structured **JSX Block DSL** rather than Markdown.
   - Regex parsing has been eliminated. The parser and renderer (`src/blocks/dsl/`) produce identical HTML markup, CSS stylesheets, and Schema.org JSON-LD graphs across both **Live Draft Preview** and **Production Builds**.
   - Both surfaces render through **Article Display**, which owns the template choice, the props the Post Template reads, the Block context and the page's meta — so parity is a property of one module rather than a convention two pages keep, and `article-display.test.ts` asserts it by rendering one Article both ways.
3. **Deep Modules & Clean Seams**:
   - Complex workflows (draft creation, duplication, saving, validation, git synchronization, media asset registration, and locking) are encapsulated inside deep modules with narrow, minimal interfaces.
   - External dependencies (database, Git API, storage, clock) sit behind pluggable adapters defined on the `Services` seam (`src/lib/services.ts`), allowing the entire domain to be tested in-memory with sub-2-second test execution.
4. **Explicit Authorial Intent ([ADR-0009](file:///e:/repos/astro/blog/docs/adr/0009-explicit-editorial-publishing-and-d1-drafts.md))**:
   - Zero background network autosave: local changes update dirty state (`isDirty = true`) protected by `beforeunload`.
   - Explicit publishing directly to `main` via atomic commits, bypassing fragile multi-step pull request branch dances.
5. **Decoupled Pluggable Blocks & Declarative Config ([ADR-0017](file:///e:/repos/astro/blog/docs/adr/0017-pluggable-site-blocks-and-declarative-config.md))**:
   - Sites define proprietary custom blocks and settings in `cms.config.ts`.
   - The CMS integration registers a Vite virtual module (`virtual:cms-init`) so custom blocks participate in SSG builds and the Admin drawer without touching CMS core.
6. **Static Posts with Dynamic Blocks & Pure Cloudflare Assets ([ADR-0018](file:///e:/repos/astro/blog/docs/adr/0018-static-posts-with-dynamic-blocks.md))**:
   - Reader posts are 100% static HTML (Astro SSG) served by Cloudflare Static Assets.
   - Blocks access dynamic data via build-time `loadServerData` or client-side Web Components (`clientScript` querying edge APIs).
   - Zero Cloudflare R2: media assets are deployed to Cloudflare Assets directly from `public/uploads/`.
7. **Bare-Text Prose & No-Markdown Editor ([ADR-0019](file:///e:/repos/astro/blog/docs/adr/0019-bare-text-prose-and-no-markdown-editor.md))**:
   - Prose paragraphs are written as bare text separated by blank lines; markdown characters have no formatting side effects.
   - CodeMirror uses tag/attribute highlighting (`@codemirror/lang-html`) for clean JSX DSL authoring.

---

## 2. Domain Model & Ubiquitous Language

Per [CONTEXT.md](file:///e:/repos/astro/blog/CONTEXT.md), domain language is strict and intentional:

| Domain Term | Definition & Role | Terms to Avoid |
| :--- | :--- | :--- |
| **Post / Article** | A publication document containing validated metadata and structured block content in JSX DSL. *"Post"* aligns with database/admin models (`posts` table, `/admin/posts`); *"Article"* aligns with editorial domain and prose presentation. | Entry, piece |
| **Block Node** | A typed, schema-validated structural unit in an article (e.g. `Paragraph`, `Heading`, `Callout`, `YouTube`, `AmazonProduct`, `List`, `Quote`, `CodeBlock`), with a unique ID, typed props, and child blocks/inline spans. | Markdown element, raw widget |
| **Mark & Mark Ref** | Inline semantic formatting. Simple styles (`Bold`, `Italic`, `Strike`, `Code`, `Underline`) are Marks; entity-referencing formatting (`Link` with `href`, `target`, `rel`, `download`) are Mark Refs. | Markdown symbols, inline tag hacks |
| **JSX Block DSL** | The human-friendly, unambiguous JSX-based authoring and storage syntax (`<Heading level={2}>`, `<Callout variant="warning">`) replacing Markdown across the entire publishing pipeline. | Markdown text, MDX body |
| **Block Registry** | The central typed registry (`src/blocks/registry.ts`) compiling schemas, self-contained CSS styles, server-side data fetchers, and JSON-LD generators for pluggable blocks. | Component list, widget index |
| **Document Renderer** | The unified rendering engine (`renderDocument`) that deterministically parses JSX Block DSL and produces identical HTML, CSS, and JSON-LD. | Markdown parser, regex renderer |
| **Post Bundle** | A folder containing a post's `index.mdx` alongside its co-located media assets within `src/content/blog/<slug>/`. | Post directory, raw folder |
| **Post Lifecycle** | The domain module coordinating all article state transitions: draft creation, post duplication, validation, Concurrency Lock verification, Post Bundle serialization, Git publishing, and D1 persistence. | Post service, article manager |
| **Services** | The edge-resolved adapter bag providing access to database, storage, Git contents, locks, and system clock through clean interfaces. | Global container, DI framework |
| **Concurrency Lock** | A pessimistic lock record in D1 (`post_locks`) granting exclusive edit rights to an active editor, maintained via heartbeats and beacon release. | Mutex, file lock |

---

## 3. Core Architecture & Component Boundaries

### 3.1. Services Seam & Ports & Adapters

All infrastructure interactions are concentrated at the edge in `src/lib/services.ts`. Callers accept `Services` rather than instantiating database clients or storage drivers directly:

```typescript
export interface Services {
  db: DbClient;
  posts: PostStore;
  locks: LockStore;
  mirror: ArticleMirror;
  contents: GithubContents | null;
  media: MediaStorage;
  assets: AssetRegistry;
  accounts: EditorAccounts;
  idempotency: IdempotencyStore;
  contentDir: string;
  uploadsDir: string;
  clock: Clock;
}
```

`contentDir` / `uploadsDir` are the repo-relative Post Bundle and asset bases on `main`, resolved per site from `CONTENT_DIR` / `UPLOADS_DIR` runtime vars. The local mirror stays checkout-relative; GitHub paths never hardcode a site layout, so a second site changes vars, not code.

- **`PostStore` (`src/lib/post-store.ts`)**: Editorial record persistence seam. Implemented by `createD1PostStore` in production and `InMemoryPostStore` for tests.
- **`LockStore` (`src/lib/locks.ts`)**: Pessimistic locking seam with time-to-live verification. Implemented by `createD1LockStore` and `InMemoryLockStore`.
- **`GithubContents` (`src/lib/github-contents.ts`)**: The sole gateway to GitHub's REST API, reading, writing and removing files (a Post Bundle under the site's content dir, or media under its uploads dir). Nothing branches: ADR-0009 made publishing a direct commit to `main`, so the module's verb list has no branch in it. Uses `HttpGithubContents` or `InMemoryGithubContents`.
- **`MediaStorage` (`src/lib/media-storage.ts`)**: Stores asset bytes (commit to the site's uploads dir via GitHub in production, or write to local disk during local development).
- **`AssetRegistry` (`src/lib/asset-registry.ts`)**: Unified seam synchronizing D1 asset records and `MediaStorage` bytes.
- **`Clock` (`src/lib/clock.ts`)**: Abstraction over time (`systemClock` vs. `FixedClock`), ensuring zero non-deterministic timestamps in tests.

### 3.2. Post Lifecycle Module

The `PostLifecycle` module (`src/lib/post-lifecycle.ts`) is a **deep module** encapsulating all post lifecycle operations behind simple, testable functions:

```mermaid
stateDiagram-v2
    [*] --> Draft: createDraftPost()
    Draft --> Draft: savePostLifecycle(status: 'draft')\n[Persist D1 only]
    Draft --> Published: savePostLifecycle(status: 'published')\n[Commit to main + project into D1]
    Published --> Draft: savePostLifecycle(status: 'draft')\n[Delete from main + persist D1]
    Published --> Published: savePostLifecycle(status: 'published')\n[Update main + update D1]
    Published --> [*]: deletePostLifecycle()\n[Remove D1 + Delete bundle on main]
    Draft --> [*]: deletePostLifecycle()\n[Remove D1]
    Draft --> DraftCopy: duplicatePostLifecycle()
    Published --> DraftCopy: duplicatePostLifecycle()
```

#### Invariants Enforced by `PostLifecycle`:
1. **Concurrency Lock Check**: Verifies that the acting user holds the active pessimistic lock (returns HTTP 423 if held by another editor).
2. **Slug Invariants**: Validates slug format (`^[a-z0-9]+(?:-[a-z0-9]+)*$`) and checks uniqueness across all posts.
3. **Renderability Verification**: Passes content through `inspectDocument`. If content contains unrenderable syntax or suspect tags for a published post, the operation is refused with HTTP 422 before touching D1 or GitHub.
4. **The Write Path Follows the Authority**: `main` is written before the editorial record describes it. A publish lands the Post Bundle in one atomic commit and then projects the row to `published`; an unpublish removes the bundle directory in one atomic commit and then moves the row to draft. A refused commit changes nothing (502, or 409 on a stale `expected_sha`/`expected_ref`); publishing without a GitHub PAT is refused with HTTP 503. Saves carry `Idempotency-Key` for safe retry. A projection write that fails leaves the Article live with a stale record, reported as `projectedToD1: false` (see ADR-0012).
5. **Git Synchronization**:
   - When publishing: verifies every `/uploads/` reference in the body plus the featured image against `public/uploads/` on `main` (one `listDirectory`), refusing with 422 naming any absent file, then lands the Post Bundle (`src/content/blog/<slug>/index.mdx`) on `main` via `contents.commitFiles` (blobs → tree → commit → ref `force:false`). Upload and delete commits are their own adds and deletes; the publish never rewrites bytes.
   - When unpublishing: removes the Post Bundle directory from `main` via `contents.deleteDirectory` (one atomic commit). Shared asset bytes stay: other Articles may reference them.
   - In local development, mirrors changes to the filesystem (`src/content/blog/`) via `ArticleMirror`.

### 3.3. JSX Block DSL & Unified Document Renderer

The blog avoids Markdown parsing and Sätteri AST hacks in favor of a clean, typed block structure:

```mermaid
flowchart LR
    Input["JSX Block DSL String\ne.g. <Callout variant='tip'>..."] --> Parser["DSL Parser\n(src/blocks/dsl/parser.ts)"]
    Parser --> AST["BlockNode Tree\n+ InlineSpan Marks"]
    AST --> AsyncData["loadAllServerData()\ne.g. RelatedPosts querying D1"]
    AsyncData --> JsonLd["collectJsonLdEntities()\ne.g. Schema.org VideoObject/Product"]
    AsyncData --> HTML["renderBlockNodeSync()\n(blockDef.render())"]
    AST --> CSS["getCombinedBlockStyles()\n(Registry CSS Aggregation)"]
    HTML --> Output["RenderDocumentResult\n{ html, jsonLd, styles, blocks }"]
```

#### Block Registration (`src/blocks/registry.ts`)
Each block definition under `src/blocks/<name>/` implements `BlockDefinition<TProps, TData>`:
- **`schema`**: Valibot schema for props validation.
- **`render(props, childrenHtml, data, ctx)`**: Pure HTML renderer.
- **`styles`**: Self-contained CSS string aggregated into the final response.
- **`loadServerData(props, ctx)`**: Optional asynchronous data fetching (e.g. `related-posts` querying other articles).
- **`generateJsonLd(props, data)`**: Schema.org entity synthesis (e.g. `YouTube` block generating `VideoObject`, `AmazonProduct` generating `Product`).
- **`drawer`**: Self-describing presentation metadata for the editor's Blocks drawer.

### 3.4. Asset Management Seam

Asset management coordinates media uploads, byte persistence, metadata tracking, and editor insertion:

```mermaid
sequenceDiagram
    autonumber
    actor Editor as Editor (Browser)
    participant API as /api/admin/assets/upload
    participant Seam as AssetRegistry (Services.assets)
    participant Rules as asset-rules.ts
    participant Media as MediaStorage
    participant D1 as D1 Database (assets table)

    Editor->>Rules: sizeVerdictFor(file) (Pre-flight check in browser)
    Editor->>API: POST /api/admin/assets/upload (FormData)
    API->>Seam: upload(file)
    Seam->>Rules: sizeVerdictFor(file) (Authoritative check in worker)
    Seam->>Media: writeMedia({ filename, content, mimeType })
    Media-->>Seam: { success: true, url }
    Seam->>D1: INSERT INTO assets (...)
    Seam-->>API: RegisterAssetResult
    API-->>Editor: JSON { assetId, filename, url, ... }
    Note over Editor: Editor calls insertionForAsset()<br/>to get JSX DSL snippet (<Image> or <Link>)
```

- **`asset-rules.ts`**: Pure, zero-dependency validation engine shared by client and server (2 MB limit for images, 25 MB for documents/other media).
- **`insertion.ts`**: The single owner of the DSL syntax for inserted assets (`<Image src="..." />` for images, `<Link href="..." download="...">` for documents).

### 3.5. Article Read Model

The `ArticleReadModel` (`src/lib/article.ts`) provides a unified query layer that abstracts the physical storage of articles:
- **`loadVisible(slug)`**: Loads a published article for public view, or a draft if drafts are explicitly enabled.
- **`listVisible()`**: Lists visible articles ordered chronologically.
- **`listRelated(options)`**: Returns related published articles by category, excluding the current article.

Behind the read model sit two distinct adapters:
1. **`createGitBundleSource()` (`src/lib/article-sources/git-bundle.ts`)**: Reads from Astro's static content collection (`src/content/blog/`). Used during production static builds (`/blog/[...slug].astro`).
2. **`createD1Source(db)` (`src/lib/article-sources/d1.ts`)**: Reads directly from D1 `posts`. Used during Live Draft Preview and in administrative queries.

---

## 4. Administrative Client Architecture

The admin editor route (`/admin/posts/[id]`, served from the CMS package) provides an interactive editorial experience using CodeMirror 6 with modular client-side components:

```
src/scripts/editor/
├── index.ts               # Entry point; wires adapters and session lifecycle
├── editor-session.ts      # Pure session state management (dirty tracking, status)
├── actions.ts             # Orchestrates save, duplicate, delete, unpublish HTTP calls
├── dom-adapter.ts         # Directs browser DOM, action bar, drawer tabs, and toolbar
├── asset-modal.ts         # Focused asset picker modal with gallery & upload dropzone
└── lock-manager.ts        # Concurrency lock heartbeat loop and Beacon API release
```

1. **`EditorSession` (`editor-session.ts`)**: Pure state machine managing content dirty flags, status state (`draft` vs `published`), and unload protection warnings.
2. **`EditorActions` (`actions.ts`)**: Translates user actions into typed API requests to `/api/admin/posts/*` and `/api/admin/assets/*`.
3. **`AssetPickerModal` (`asset-modal.ts`)**: Standalone modal dialog presenting an asset browser with search, category filtering, drag-and-drop file upload, and a clean selection callback.
4. **`LockManager` (`lock-manager.ts`)**: Periodically pings `/api/admin/posts/lock` every 30 seconds to maintain the pessimistic lock, releasing it via `navigator.sendBeacon` upon window unload.

---

## 5. Security & Authentication

1. **Password Hashing (`src/lib/auth.ts`)**:
   - Secure PBKDF2 key derivation (`PBKDF2-HMAC-SHA256`) with 100,000 iterations and cryptographically random 16-byte salts.
2. **Editor Accounts (`src/lib/editor-accounts.ts`)**:
   - The one place an Editor is identified: credentials are verified and sessions issued, validated and revoked there, over a private Account Store seam (D1 through Drizzle, or an in-memory substitute).
   - Sessions are random 32-byte hexadecimal tokens in the `sessions` table, and they last 30 days; `admin_session` is HttpOnly, Secure and SameSite=Lax.
   - A password change re-derives the hash with a fresh salt and ends every session except the one that made the change. An Editor can also end any of their open sessions, or all of them, from Profile & Security (`/api/admin/profile/sessions/*`).
3. **Edge Middleware Guard (`src/middleware.ts`)**:
   - Intercepts all requests matching `/admin` and `/api/admin`.
   - Asks Editor Accounts who the `admin_session` token belongs to, and is the only writer of `Astro.locals.user`.
   - Redirects unauthenticated requests to `/admin/login` or returns 401 JSON for API endpoints.

---

## 6. Directory Layout

```
.
├── CONTEXT.md                    # Canonical domain glossary and definitions
├── docs/
│   ├── adr/                      # Architectural Decision Records (0001 - 0014)
│   ├── agents/                   # Agent operational guides (domain, triage, issues)
│   └── architecture.md           # This document
├── packages/
│   ├── blocks/                   # Self-contained blocks: zero imports outside itself
│   │   ├── src/[block]/          # One directory per block (schema, render, styles,
│   │   │                         # JSON-LD, server data, drawer card, toolbar buttons)
│   │   ├── src/dsl/              # Parser, serializer, inspector, and renderer
│   │   ├── src/registry.ts       # The only hardcoded block list (removal contract)
│   │   ├── src/toolbar.ts        # Marks plus registered entries, ordered
│   │   └── src/asset-rules.ts    # Dependency-free upload validation
  │   └── cms/                      # Versioned CMS: everything sites share, zero real content
  │       ├── src/lib/              # Core domain modules, seams, and adapters
  │       │   ├── article-display.ts# What an Article becomes per mode (published / preview)
  │       │   ├── article-projection.ts # Article (main) → editorial record
  │       │   ├── post-lifecycle.ts # Deep module managing all post state transitions
  │       │   ├── github-contents.ts# GitHub REST API adapter (atomic commits, CAS)
  │       │   ├── idempotency-store.ts # Idempotent save replay
  │       │   └── services.ts       # Services seam resolving adapters at the edge
  │       ├── src/routes/           # Injected admin pages + /api/admin/* (cmsAdmin injectRoute)
  │       ├── src/integration.ts    # cmsAdmin(): injects the admin routes into each site
  │       ├── src/middleware.ts     # Edge auth guard (sites delegate their hook here)
  │       ├── src/db/schema.ts      # Drizzle D1 database schema
│       ├── src/templates/        # Post presentation templates (default, two-column)
  │       ├── src/layouts/AdminLayout.astro # Authenticated admin shell (login renders in site chrome)
  │       ├── src/components/article-fragment.astro # The Article, without any page
│       ├── src/scripts/editor/   # Browser-side CodeMirror and UI controllers
│       ├── src/content.ts        # defineBlogCollection factory (sites name authors)
│       ├── migrations/           # D1 database SQL migrations (sites point at these)
│       └── scripts/              # cms-project-view, cms-create-user bins
  └── sites/
  │     └── site-a/                   # Thin site shell: content, chrome, config, deploys
  │         ├── astro.config.mjs      # Astro configuration (Cloudflare adapter + MDX loader + cmsAdmin)
  │         ├── wrangler.jsonc        # Worker, D1 binding, migrations_dir into packages/cms
  │         ├── src/content/blog/     # Published Post Bundles (git is truth per site)
  │         ├── public/uploads/       # Published asset bytes (git is truth per site)
  │         ├── src/pages/            # Site pages + login + draft preview (the rest comes from cmsAdmin)
  │         ├── src/layouts/root-layout.astro # Site page shell (header/footer/consts)
  │         ├── src/middleware.ts     # Delegates auth to cms/middleware
  │         └── src/content.config.ts # Delegates to defineBlogCollection with site authors
  ```
  
  Sites import `cms/*` and `blocks/*`; neither package imports sites, and `blocks/*`
  imports nothing outside itself (the CMS satisfies its structural article-source
  interface). Removing a block is deleting its directory plus its manifest lines:
  drawer cards, toolbar buttons, validation, rendering, styles, and JSON-LD follow,
  and content still using its tag is refused at save naming it. Admin pages and API
  routes live in `packages/cms/src/routes/` and reach each site through the
  `cmsAdmin()` integration's `injectRoute`; login and the draft preview stay site-owned files
  because both compose the site's own page shell (ADR-0016). The toolbar contract test
  reads the editor page from its CMS path and moves with it at repo-split.

---

## 7. Testing Strategy

The architecture follows a strict **"accept dependencies, don't create them"** discipline, enabling high-coverage unit testing across all domain invariants without requiring live network connections, external databases, or Cloudflare Workers emulators.

- **Vitest Suite**: 180+ tests run in under 2 seconds.
- **In-Memory Substitutes**:
  - `InMemoryPostStore` replaces D1 SQLite.
  - `InMemoryLockStore` replaces D1 pessimistic locks.
  - `InMemoryAssetRegistry` replaces database and media storage.
  - `InMemoryGithubContents` simulates the GitHub REST API and git branches.
  - `FixedClock` guarantees deterministic timestamps.
- **Test Coverage**:
  - `post-lifecycle.test.ts`: Validates all transitions (drafting, publishing, unpublishing, deleting, duplicating, locking, and validation errors).
  - `article.test.ts`: Verifies the `ArticleReadModel`, visibility filtering, and related posts logic.
  - `inspect.test.ts`: Ensures invalid or unrenderable JSX Block DSL tags are refused prior to publishing.
  - `asset-registry.test.ts`: Validates file size rules, metadata updates, and upload workflows.
  - `actions.test.ts` & `editor-session.test.ts`: Tests client-side dirty state transitions, action buttons, and keyboard shortcuts.
