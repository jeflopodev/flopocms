# Blog Publishing Context

The content management, authoring, and delivery model for the blog.

## Language

**Post / Article**:
A publication document containing validated metadata and structured block content authored in a JSX-like DSL. The terms "Post" and "Article" are used interchangeably across the system: "Post" aligns with the database model (`posts` table, `post_slug`) and editorial routes (`/admin/posts`), while "Article" reflects the editorial domain and prose presentation.
_Avoid_: Entry, piece

**Block Node**:
A typed, schema-validated structural unit in an article document (such as `Paragraph`, `Heading`, `Callout`, `YouTube`, `AmazonProduct`, `List`, `Quote`, or `CodeBlock`), possessing a unique identifier, typed properties, and optional child blocks or inline spans.
_Avoid_: Markdown element, raw widget

**Mark & Mark Ref**:
Inline semantic formatting attached to text spans without markdown characters. Simple styles (`Bold`, `Italic`, `Strike`, `Code`, `Underline`) are represented as Marks, while entity-referencing annotations (such as `Link` with destination `href`) are Mark Refs.
_Avoid_: Markdown symbols, inline tag hacks

**JSX Block DSL**:
The human-friendly, unambiguous JSX-based authoring and storage syntax replacing legacy Markdown across the entire publishing pipeline.
_Avoid_: Markdown text, MDX body

**Block Registry**:
The central typed registry (`src/blocks/registry.ts`) that auto-registers pluggable block definitions, compiling schemas, self-contained CSS styles, server-side data fetchers, and JSON-LD generators.
_Avoid_: Component list, widget index

**Document Renderer**:
The unified rendering engine (`renderDocument`) that deterministically parses the JSX Block DSL and produces identical HTML markup, self-contained CSS, and JSON-LD graphs across both Live Draft Preview and production.
_Avoid_: Markdown parser, regex renderer

**Post Bundle / Article Bundle**:
A folder containing a post's `index.mdx` alongside its co-located media assets within `src/content/blog/<slug>/`.
_Avoid_: Post directory, raw folder

**Editor**:
One of the two authenticated users (`jeflopo` or `aflopo`) who writes, updates, and publishes articles and posts.
_Avoid_: Admin, author, contributor

**Draft**:
A post or article flagged as work-in-progress (`draft: true` or saved in D1) that is not rendered on production builds.
_Avoid_: Staged article, unpublished item

**Asset Insertion**:
The text an uploaded asset contributes to an Article when it is inserted or copied: an `<Image>` block for an image, a `<Link>` inside a `<Paragraph>` for anything else. Authored in JSX Block DSL, never Markdown, because the Document Renderer escapes text — `![alt](url)` reaches a reader as those characters.
_Avoid_: Snippet, markdown template, embed code

**Admin Dashboard**:
The server-rendered administrative interface (`/admin`) on Cloudflare Workers providing post tables (`/admin/posts`), asset management, and editorial actions.
_Avoid_: Backoffice, control panel, CMS UI

**Article Editor / Post Editor**:
A full-screen CodeMirror workspace featuring a top action bar, an inline Mark toolbar, and exclusive right-docked side panels (Settings and Blocks).
_Avoid_: Text box, edit page

**Profile & Security**:
The user profile page (`/admin/profile`) where an authenticated Editor views account stats and securely updates their PBKDF2 password.
_Avoid_: User settings, account view

**Settings Panel**:
The default right-docked editor panel managing frontmatter metadata (title, slug, author, category, tags, featured image, pubDate).
_Avoid_: Metadata sidebar, post settings

**Blocks Panel**:
The right-docked drawer presenting the insertion cards the Block Registry publishes — one card per block, carrying its own label, icon, preview and snippet, so adding a block adds no markup to the drawer.
_Avoid_: Component drawer, widget tray

**Asset Rules**:
The dependency-free module (`src/lib/asset-rules.ts`) that decides what counts as an image and whether a file may be uploaded (`2 MB` images, `25 MB` anything else). Both the Worker and the browser import it, so the verdict is written once rather than per call site.
_Avoid_: Validation utils, upload constants

**Asset Registry**:
The central asset management seam (`src/lib/asset-registry.ts`) on `Services` coordinating uploaded media asset records in D1 with physical byte storage in Media Storage behind a single typed interface (`upload`, `delete`, `updateMetadata`, `list`, `find`).
_Avoid_: Media library, file table

**Media Storage**:
The storage module that persists raw media asset bytes to their target environment (GitHub REST API under `public/uploads/` on production Workers, or local filesystem in development) behind a unified interface.
_Avoid_: File driver, S3 adapter

**Post Lifecycle**:
The domain module coordinating all article state transitions (draft creation, post duplication, article validation, Concurrency Lock verification, Post Bundle serialization, commits to `main` through GitHub Contents, and Cloudflare D1 persistence through the Post Store).
_Avoid_: Post service, article manager

**Post Store**:
The editorial record seam (`src/lib/post-store.ts`) through which Post Lifecycle reads and writes a `posts` row, so its draft, publish and unpublish transitions can run without a database. D1 through Drizzle is the real adapter; an in-memory store is the substitute.
_Avoid_: Post repository, DAO, query builder

**Article Read Model**:
The single place through which an Article is read, independent of whether it is currently held as a Draft in Cloudflare D1 or as a published bundle on `main`. Published content is authoritative on `main`; Draft content is authoritative in D1; D1 is always authoritative for editorial state such as Concurrency Locks.
_Avoid_: Post repository, content loader, content query

**GitHub Contents**:
The module (`src/lib/github-contents.ts`) that is the only thing in the Worker reading or writing files on the blog repository: a Post Bundle published to `main`, a media asset under `public/uploads/`, or an interrupted branch cleanup. Callers name a path and a commit message; the repository, credentials, encoding and `sha` preconditions stay inside.
_Avoid_: Git Sync Publisher, deploy hook, repo sync

**Breakout Component**:
A Block that visually spans beyond the standard article prose width via the `stretch` prop (`default`, `wide`, `full`, or custom CSS length).
_Avoid_: Bleed element, wide block

**D1 Draft Isolation**:
The model where unpublished draft articles are managed exclusively in Cloudflare D1 (and local filesystem in dev) without opening branches or PRs on GitHub, previewed in real-time via SSR.
_Avoid_: Content branch, draft PR

**Atomic Main Publishing**:
The explicit publishing transition where marking an article as `Published` validates metadata and commits directly to `main` via the GitHub REST API, triggering production static deployment on Cloudflare Workers.
_Avoid_: Automated PR merge, squash merge dance

**Concurrency Lock**:
A pessimistic lock record in D1 (`post_locks`) that grants exclusive edit rights to an active editor, refreshed via heartbeats and immediately released upon closing or navigating away.
_Avoid_: Mutex, file lock

**Live Draft Preview**:
The real-time preview route (`/admin/posts/[id]/preview`) rendered on-demand in Cloudflare Workers using D1 post state, the designated template, and stretch CSS variables without waiting for CI builds.
_Avoid_: Build preview, staged site
