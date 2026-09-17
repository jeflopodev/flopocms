# Blog Publishing Context

The content management, authoring, and delivery model for the blog.

## Language

**Article**:
An MDX document containing publication content, validated metadata, and embedded UI components.
_Avoid_: Post, entry, piece

**Article Bundle**:
A folder containing an article's `index.mdx` alongside its co-located media assets.
_Avoid_: Article folder, post directory

**Editor**:
One of the two authenticated users (`jeflopo` or `aflopo`) who writes, updates, and publishes articles.
_Avoid_: Admin, author, contributor

**Draft**:
An article flagged as work-in-progress (`draft: true` or saved in D1) that is not rendered on production builds.
_Avoid_: Staged article, unpublished post

**Admin Dashboard**:
The server-rendered administrative interface (`/admin`) on Cloudflare Workers providing post tables, asset management, and editorial actions.
_Avoid_: Backoffice, control panel, CMS UI

**Article Editor**:
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
A D1 database table tracking uploaded media assets, variants, and article associations alongside their co-located Git bundle paths.
_Avoid_: Media library, file table

**Git Sync Publisher**:
The Cloudflare Worker backend service that pushes D1 article state and assets to GitHub via the GitHub REST API upon publication, triggering static build.
_Avoid_: Deploy hook, repo sync

**Breakout Component**:
A custom MDX component that visually spans beyond the standard article prose width via the `stretch` prop (`default`, `wide`, `full`, or custom CSS length).
_Avoid_: Bleed element, wide block

**Schema Extractor**:
A Sätteri AST plugin that parses embedded MDX component props at build time to synthesize a unified JSON-LD `@graph`.
_Avoid_: Schema generator, LD parser
