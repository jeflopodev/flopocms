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

## Amendment (2026-09-22)

Decision 3 has a write-path counterpart the decision never stated, and the save path chose the wrong side of it. The D1 row was written as `published` first and the bundle committed to `main` second, so a refused commit left a row claiming published that no reader could ever see — the defect state decision 3 exists to detect. `post-lifecycle.test.ts` asserts exactly that outcome, and the mirror case is untested: a Draft save flips the row before deleting the bundle from `main`, so a refused delete leaves `main` serving an Article the editorial record calls a Draft (`status-differs`).

**The write path follows the authority.** A publish commits the Post Bundle to `main` first and moves the row to `published` after; an unpublish removes the bundle from `main` first and moves the row to draft after. A refused commit therefore changes nothing and stays a refusal rather than a half-published Article, and a failed projection write leaves the Article live with a stale projection — the failure worth having, because a later save re-projects it. Publishing is refused outright when no GitHub PAT is configured, since publishing without one can only manufacture `missing-from-main`. An explicit re-projection clears a stale record without waiting for someone to open the Article.

Decision 3 also promised that a published row whose bundle is absent from `main` is "surfaced in the Admin Dashboard". It is detected by the deploy gate (`pnpm run check:divergence`) and nowhere else; that surface is still owed, and the re-projection action belongs beside it.
