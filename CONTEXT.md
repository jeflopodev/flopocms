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
One of the two authoring users (`jeflopo` or `aflopo`) who writes, updates, and publishes articles via Git and MDX.
_Avoid_: Admin, author, contributor

**Editor Branch**:
A Git branch isolated to a specific editor and article using the namespace prefix `jeflopo/<slug>` or `aflopo/<slug>`.
_Avoid_: Feature branch, work branch

**Draft**:
An article flagged as work-in-progress (`draft: true`) that is rendered on preview deployments but omitted from production builds and feeds.
_Avoid_: Staged article, unpublished post

**Editorial PR**:
A GitHub Pull Request opened from an Editor Branch to `main`, which automatically triggers a Cloudflare Preview Deployment.
_Avoid_: Content ticket, review request

**Preview Deployment**:
An ephemeral branch or pull-request build on Cloudflare used by editors to review articles before release.
_Avoid_: Staging environment, test site

**Breakout Component**:
A custom MDX component that visually spans beyond the standard article prose width via the `stretch` prop (`default`, `wide`, `full`, or custom CSS length).
_Avoid_: Bleed element, wide block

**Schema Extractor**:
A Sätteri AST plugin that parses embedded MDX component props at build time to synthesize a unified JSON-LD `@graph`.
_Avoid_: Schema generator, LD parser

**Generic Schema Component**:
A fallback `<Schema type="..." data={{...}} />` MDX component that injects arbitrary Schema.org entities into the page JSON-LD graph.
_Avoid_: Meta component, raw schema tag

**Article Scaffolder**:
A CLI generator script (`pnpm new-article`) that automates branch creation, article bundle generation, initial commit, push, and draft PR creation.
_Avoid_: Post generator, template script

**Image Guardrail**:
A repository validation rule that warns or halts builds if any unoptimized source image in an article bundle exceeds 2MB.
_Avoid_: Asset limit, image filter
