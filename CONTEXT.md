# Blog Publishing Context

The content management, authoring, and delivery model for the blog: Publication, Document and Assets, alongside the surfaces an Editor works in and the identity behind them.

## Language

### Publication

**Post / Article**:
A publication document containing validated metadata and structured block content authored in a JSX-like DSL. The terms "Post" and "Article" are used interchangeably across the system: "Post" aligns with the database model (`posts` table, `post_slug`) and editorial routes (`/admin/posts`), while "Article" reflects the editorial domain and prose presentation.
_Avoid_: Entry, piece

**Draft**:
A post with no Post Bundle on `main`, held only in D1 and never rendered on production builds.
_Avoid_: Staged article, unpublished item

**Published**:
A post with a Post Bundle on `main`. Published-ness is the bundle existing, never a flag an Editor writes.
_Avoid_: Published status, live flag

**Published View**:
The disposable D1 copy of a Published post, written only by the projector from `main` and never authored.
_Avoid_: Cached post, synced row

**Post Bundle / Article Bundle**:
A folder containing a post's `index.mdx` alongside its co-located media assets within `src/content/blog/<slug>/`.
_Avoid_: Post directory, raw folder

**Post Lifecycle**:
The domain module coordinating all article state transitions from Draft to Published and back, through GitHub Contents and the Post Store.
_Avoid_: Post service, article manager

**Post Store**:
The editorial record seam (`src/lib/post-store.ts`) through which Drafts are authored and the Published View is projected. Drafts are written by Post Lifecycle; the published half is written only by the projector from `main`. D1 through Drizzle is the real adapter; an in-memory store is the substitute.
_Avoid_: Post repository, DAO, query builder

**Article Read Model**:
The single place through which an Article is read. Published content is authoritative on `main`; Draft content is authoritative in D1; the D1 copy of a Published article is a disposable view of `main`; D1 is always authoritative for editorial state such as Concurrency Locks.
_Avoid_: Post repository, content loader, content query

**GitHub Contents**:
The module (`src/lib/github-contents.ts`) that is the only thing in the Worker reading or writing files on the blog repository: a Post Bundle plus new assets in one atomic commit to `main`, a media asset under `public/uploads/`, or an interrupted branch cleanup. Callers name a path and a commit message; the repository, credentials, encoding and expected-`sha` preconditions stay inside.
_Avoid_: Git Sync Publisher, deploy hook, repo sync

**Atomic Main Publishing**:
The explicit publishing transition where publishing validates metadata and lands bundle plus new assets in one atomic commit to `main`, triggering production static deployment on Cloudflare Workers.
_Avoid_: Automated PR merge, squash merge dance

**D1 Draft Isolation**:
The model where unpublished draft articles are managed exclusively in Cloudflare D1 (and local filesystem in dev) without opening branches or PRs on GitHub, previewed in real-time via SSR.
_Avoid_: Content branch, draft PR

**Live Draft Preview**:
The real-time preview route (`/admin/posts/[id]/preview`) rendered on-demand in Cloudflare Workers using D1 post state, the designated template, and stretch CSS variables without waiting for CI builds.
_Avoid_: Build preview, staged site

**Article Display**:
The module that renders one Article as a page: it picks the Post Template, maps the Article to that template's props, gives the Document Renderer the context its blocks read, and owns the page's title, description and JSON-LD. The Article a reader opens and the Draft an Editor previews cross this same module, so the two differ by the mode they render in rather than by the pipeline they run.
_Avoid_: Article page, page component, blog template

**Concurrency Lock**:
A pessimistic lock record in D1 (`post_locks`) that grants exclusive edit rights to an active editor, refreshed via heartbeats and immediately released upon closing or navigating away.
_Avoid_: Mutex, file lock

### Document

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

**Breakout Component**:
A Block that visually spans beyond the standard article prose width via the `stretch` prop (`default`, `wide`, `full`, or custom CSS length).
_Avoid_: Bleed element, wide block

**Asset Insertion**:
The text an uploaded asset contributes to an Article when it is inserted or copied: an `<Image>` block for an image, a `<Link>` inside a `<Paragraph>` for anything else. Authored in JSX Block DSL, never Markdown, because the Document Renderer escapes text — `![alt](url)` reaches a reader as those characters.
_Avoid_: Snippet, markdown template, embed code

### Assets

**Asset Rules**:
The dependency-free module (`src/lib/asset-rules.ts`) that decides what counts as an image and whether a file may be uploaded (`2 MB` images, `25 MB` anything else). Raster originals (JPEG, PNG, BMP, TIFF) are stored as WebP; AVIF passes through. Both the Worker and the browser import it, so the verdict is written once rather than per call site.
_Avoid_: Validation utils, upload constants

**Asset Registry**:
The central asset management seam (`src/lib/asset-registry.ts`) on `Services` coordinating uploaded media asset records in D1 with physical byte storage in Media Storage behind a single typed interface (`upload`, `delete`, `updateMetadata`, `list`, `find`).
_Avoid_: Media library, file table

**Asset Library**:
The view model through which an Asset is browsed or chosen: which Assets a surface shows, in what order, and what each one says about itself. The Asset Registry page in the Admin Dashboard and the Asset Picker inside the Article Editor both read it, so a rule such as searching alternative text holds on both.
_Avoid_: Media gallery, asset browser, asset grid

**Media Storage**:
The storage module that persists raw media asset bytes to their target environment (GitHub REST API under `public/uploads/` on production Workers, or local filesystem in development) behind a unified interface.
_Avoid_: File driver, S3 adapter

**Asset Bytes**:
The files under `public/uploads/` on `main`, written once at upload and removed once at delete, never rewritten at publish. A bundle referencing absent bytes refuses to publish.
_Avoid_: Staged upload, pending media

### Editorial Surfaces

**Admin Dashboard**:
The server-rendered administrative interface (`/admin`) on Cloudflare Workers providing post tables (`/admin/posts`), asset management, and editorial actions.
_Avoid_: Backoffice, control panel, CMS UI

**Article Editor / Post Editor**:
A full-screen CodeMirror workspace featuring a top action bar, an inline Mark toolbar, and exclusive right-docked side panels (Settings and Blocks).
_Avoid_: Text box, edit page

**Settings Panel**:
The default right-docked editor panel managing frontmatter metadata (title, slug, author, category, tags, featured image, pubDate).
_Avoid_: Metadata sidebar, post settings

**Blocks Panel**:
The right-docked drawer presenting the insertion cards the Block Registry publishes — one card per block, carrying its own label, icon, preview and snippet, so adding a block adds no markup to the drawer.
_Avoid_: Component drawer, widget tray

**Profile & Security**:
The user profile page (`/admin/profile`) where an authenticated Editor sees their account and article stats, updates their PBKDF2 password, and ends the sessions signed in as them — one device, or all of them.
_Avoid_: User settings, account view

### Identity

**Editor**:
One of the two authenticated users (`jeflopo` or `aflopo`) who writes, updates, and publishes articles and posts.
_Avoid_: Admin, author, contributor

**Editor Account**:
The stored identity of an Editor: a username, a password hash, and the salt it was derived with. The `users` row is one spelling of it; the concept is the credential identity, not the table.
_Avoid_: User, login, admin account

**Editor Accounts**:
The platform module that identifies an Editor: it verifies credentials and issues, validates and revokes sessions, over an Account Store seam. It is not one of the three editorial domains — every editorial surface depends on it.
_Avoid_: Auth service, login controller, user accounts

**Account Store**:
The seam beneath Editor Accounts through which an Editor Account and its sessions are read and written, so the module can be exercised without a database. D1 through Drizzle is the real adapter; an in-memory store is the substitute.
_Avoid_: User repository, DAO, auth provider
