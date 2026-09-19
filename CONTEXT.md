# Blog Publishing Context

The content management, authoring, and delivery model for the blog.

## Language

**Post / Article**:
An MDX document containing publication content, validated metadata, and embedded UI components. The terms "Post" and "Article" are used interchangeably across the system: "Post" aligns with the database model (`posts` table, `post_slug`) and editorial routes (`/admin/posts`), while "Article" reflects the editorial domain and prose presentation.
_Avoid_: Entry, piece

**Post Bundle / Article Bundle**:
A folder containing a post's `index.mdx` alongside its co-located media assets within `src/content/blog/<slug>/`.
_Avoid_: Post directory, raw folder

**Editor**:
One of the two authenticated users (`jeflopo` or `aflopo`) who writes, updates, and publishes articles and posts.
_Avoid_: Admin, author, contributor

**Draft**:
A post or article flagged as work-in-progress (`draft: true` or saved in D1) that is not rendered on production builds.
_Avoid_: Staged article, unpublished item

**Admin Dashboard**:
The server-rendered administrative interface (`/admin`) on Cloudflare Workers providing post tables (`/admin/posts`), asset management, and editorial actions.
_Avoid_: Backoffice, control panel, CMS UI

**Article Editor / Post Editor**:
A full-screen CodeMirror workspace featuring a top action bar, markdown formatting toolbar, and exclusive right-docked side panels (Settings and Blocks).
_Avoid_: Text box, edit page

**Profile & Security**:
The user profile page (`/admin/profile`) where an authenticated Editor views account stats and securely updates their PBKDF2 password.
_Avoid_: User settings, account view

**Settings Panel**:
The default right-docked editor panel managing frontmatter metadata (title, slug, author, category, tags, featured image, pubDate).
_Avoid_: Metadata sidebar, post settings

**Blocks Panel**:
The right-docked drawer presenting custom component widgets (Amazon Product, YouTube, Pros/Cons, Schema) that can be inserted into the editor.
_Avoid_: Component drawer, widget tray

**Global MDX Components**:
Custom components (`AmazonProduct`, `YouTube`, `Schema`) auto-imported globally across all MDX documents, eliminating manual in-file import statements.
_Avoid_: Local imports, component scripts

**Asset Registry**:
A D1 database table (`assets`) tracking uploaded media assets, variants, and post/article associations alongside their co-located Git bundle paths.
_Avoid_: Media library, file table

**Git Sync Publisher**:
The Cloudflare Worker backend service that pushes D1 post state and assets to GitHub via the GitHub REST API upon publication, triggering static build.
_Avoid_: Deploy hook, repo sync

**Breakout Component**:
A custom MDX component that visually spans beyond the standard article prose width via the `stretch` prop (`default`, `wide`, `full`, or custom CSS length).
_Avoid_: Bleed element, wide block

**Schema Extractor**:
A Sätteri AST plugin that parses embedded MDX component props at build time to synthesize a unified JSON-LD `@graph`.
_Avoid_: Schema generator, LD parser

**Content Branch / Editorial Branch**:
An isolated Git branch (`content/<slug>`) created per article during drafting, associated with an automated Pull Request against `main`.
_Avoid_: Working copy, temp branch

**Automated PR Merge**:
The automated publishing transition where marking an article as `Published` commits with `draft: false`, merges the open PR into `main` via the GitHub API, and cleans up the remote content branch.
_Avoid_: Manual merge, direct push

**Concurrency Lock**:
A pessimistic lock record in D1 (`post_locks`) that grants exclusive edit rights to an active editor, refreshed via heartbeats and immediately released upon closing or navigating away.
_Avoid_: Mutex, file lock

**Live Draft Preview**:
The real-time preview route (`/admin/posts/[id]/preview`) rendered on-demand in Cloudflare Workers using D1 post state, the designated template, and stretch CSS variables without waiting for CI builds.
_Avoid_: Build preview, staged site
