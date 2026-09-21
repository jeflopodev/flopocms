# Published Article Authority: `main` owns content, D1 owns editorial state

**Status**: Accepted (extends [ADR-0009](0009-explicit-editorial-publishing-and-d1-drafts.md))

## Context

ADR-0009 made Drafts live exclusively in Cloudflare D1 and published articles commit directly to `main`, mirrored into the D1 `posts` table. It never said which of the two answers a read. In practice both do: production renders from the Astro content collection (the Git bundle), while Live Draft Preview, the Admin Dashboard and the `RelatedPosts` block render from D1 rows. `scripts/reconcile-content.mjs` exists solely to stop the two copies drifting, and it hand-rolls a frontmatter parser plus SQL literals to do it.

That ambiguity is the thing worth recording, because the obvious reading — "D1 is the database, `main` is a build artifact produced from it" — is the one we rejected.

## Decision

1. **`main` is authoritative for published Article content and metadata.** The Git bundle at `src/content/blog/<slug>/index.mdx` is the source of truth for everything a reader sees.
2. **D1 is authoritative for Draft content**, and authoritative for editorial state at all times: Concurrency Locks, and the post's editorial record.
3. **The D1 `posts` row is a projection of `main` for published Articles.** Divergence is a defect state to be detected, never a second source of truth. A published row whose bundle is absent from `main` is surfaced in the Admin Dashboard and is not rendered publicly.
4. **All Article reads go through the Article Read Model**, never a direct query against the store that happens to be convenient. `RelatedPosts` reads through it rather than querying `posts`.

## Consequences

- The reconciler becomes a divergence check between the two stores, not a writer of truth.
- Public pages stay statically built from the Git bundle; the runtime D1 adapter serves preview and admin.
- Two adapters satisfy one seam, which is what makes the seam real.
