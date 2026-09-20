# Explicit Editorial Publishing, Atomic Git Sync, and D1 Draft Isolation

## Status
Accepted (Supersedes branching and automated PR model from [ADR-0008](0008-isolated-content-branches-and-concurrency-locks.md); extends [ADR-0005](0005-d1-editorial-admin-with-git-sync.md) and [ADR-0007](0007-global-asset-registry-and-pluggable-blocks.md))

## Context
ADR-0008 introduced automated Git content branching (`content/<slug>`) and draft Pull Requests for every article being written, paired with an aggressive 1.5-second autosave in the editor. In practice, this created severe operational friction and architectural fragility:
1. **Unwanted GitHub PR noise & user confusion**: Every keystroke during drafting generated draft branches and open PRs on GitHub, misleading authors into thinking they had to visit GitHub to merge PRs manually.
2. **Fragile 5-step automated PR dance**: Publishing an article executed five consecutive network requests within a single Cloudflare Worker invocation (ensure branch → commit → ensure PR → squash merge → delete branch). If any step failed, repository state became inconsistent, leaving misleading commit messages (e.g. `[Draft] post-2 (#3)`) on `main`.
3. **Loss of authorial control via autosave**: Changes were sent to the network automatically every 1.5 seconds without explicit author confirmation, causing unintended commits and publishes when toggling status.

## Decision

1. **Zero Autosave to Network (Explicit Author Intent)**:
   - Automated background saving timers are completely eliminated. Editing text and modifying metadata only updates local dirty state (`isDirty = true`), clearly marked in the UI as "Cambios sin guardar".
   - Browser navigation away from unsaved edits is protected via `beforeunload` events.
   - Authors explicitly trigger persistence:
     - `Ctrl+S` / `Cmd+S`: Saves the current state (as draft or published according to the active status).
     - Explicit primary and secondary action buttons placed prominently at the rightmost edge of the top action bar.

2. **D1 Draft Isolation (No Git Branches or PRs for Drafts)**:
   - Draft articles live exclusively in Cloudflare D1 (and the local filesystem during local development).
   - Zero Git branches, zero commits, and zero Pull Requests are created while an article is in `draft` status.
   - Real-time previews continue to render on-demand via the Cloudflare Worker SSR preview route (`/admin/posts/[id]/preview`), eliminating CI build delays.

3. **Atomic Direct Publishing to `main`**:
   - Marking an article as `Published` compiles and validates the MDX bundle and commits directly to `main` via a single, atomic GitHub REST API call (`PUT /contents/src/content/blog/<slug>/index.mdx`).
   - Commits use clean, conventional messages (`feat(blog): publish "<title>" by @<author>`).
   - Pushing to `main` natively triggers the GitHub Actions deployment workflow (`Deploy to Cloudflare Workers`).
   - If an article is unpublished, it is removed from `main` via an atomic delete API call (`DELETE /contents/...`) and restored cleanly to draft in D1.

4. **Preserved Features from ADR-0008**:
   - Pessimistic concurrency locks in D1 (`post_locks`) with heartbeat renewal and instant beacon release remain active to protect against simultaneous multi-editor collisions.
   - Full AST schema extraction and custom breakout components remain 100% compatible.
