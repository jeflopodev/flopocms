# Isolated Content Branches, Concurrency Locks, and Automated PR Merging

## Status
Accepted (Extends [ADR-0005](0005-d1-editorial-admin-with-git-sync.md) and [ADR-0007](0007-global-asset-registry-and-pluggable-blocks.md))

## Context
As the blog editorial workflow expanded to support two remote editors (one purely authoring and the other simultaneously developing features in code), direct commits to the `main` branch created three operational risks:
1. Contaminating the production `main` branch with incomplete drafts or invalid frontmatter.
2. Race conditions and conflicting overwrites if both editors opened and edited the same article simultaneously from different locations.
3. Broken media previews when uploading images within a post before Git CI deployment had completed.

## Decision

1. **Isolated Content Branches (`content/<slug>`)**:
   - Every article being drafted or updated is assigned an isolated Git branch `content/<slug>`.
   - An open Pull Request (`[Draft] <Title>`) is automatically maintained against `main`.
   - `main` is protected and reserved exclusively for codebase development and approved editorial merges.

2. **Unified Action Bar ("Save" & Automated PR Merge)**:
   - Editors select `[ Draft | Published ]` and click a single primary **Save** button.
   - When saving as `Draft`: commits to `content/<slug>` with `draft: true` and updates the PR.
   - When saving as `Published`: commits to `content/<slug>` with `draft: false`, validates frontmatter, executes automated squash merge into `main` via the GitHub REST API, and deletes the remote branch. The push to `main` triggers production static deployment on Cloudflare Workers.

3. **Pessimistic Concurrency Locks in D1**:
   - A `post_locks` table in Cloudflare D1 tracks the active editor per post with timestamp expiration.
   - A 20-second client heartbeat refreshes the lock.
   - If another editor attempts to open the post, the editor enters a non-destructive **Read-Only Mode** with inputs disabled and a prominent banner.
   - When an editor closes the tab, navigates away, or clicks "Back to Articles", an instant release event (`navigator.sendBeacon`) frees the lock immediately (0 ms wait).

4. **Instant Worker Draft Previews**:
   - Rather than waiting for CI deployments, drafts are previewed directly through the Cloudflare Worker SSR runtime at `/admin/posts/[id]/preview`.
   - Previews render the article using the selected template (`default` or `two-column`), the stretch system CSS variables (`--content-width`, `--wide-width`), and embedded components in real time.

5. **Direct Asset Uploads Without Broken Previews**:
   - Media uploaded through the editor modal bypasses broken CDN preview states and is inserted directly into the editor document as clean Markdown/HTML references.
   - Modals in both the post editor and media manager are centered using `position: fixed; inset: 0; margin: auto;`.

6. **Full Schema & Template Compatibility**:
   - Frontmatter attributes (`template`, `defaultWidth`, `wideWidth`, `author`, `heroImage`) and JSX AST blocks (`<AmazonProduct>`, `<YouTube>`, `<Schema>`) are strictly preserved, maintaining 100% fidelity with the Sätteri AST JSON-LD schema extractor and custom block ecosystem.
