# Projector-Owned Published View and Atomic Publishing

Supersedes ADR-0011 decision 3's dashboard surface: the D1 half of a Published Article is a materialized view of `main` written only by the projector, `main` is the sole writer of published-ness, publishing lands bundle plus new assets in one atomic commit, and convergence is a retrying loop rather than a Divergence page.

## Status
Accepted (Supersedes [ADR-0011](0011-published-article-authority.md) decision 3 and its 2026-09-22 amendment's re-projection action)

## Context
ADR-0011 left `posts.status` with two writers — the save path authored `published` and the projection derived it from `main` — so every `diffArticleStores` kind was one way the writers could disagree. Reordering chose which divergence appears, not whether one can.

## Decision
1. Same `posts` row, projector owns the published half: Post Lifecycle authors Drafts; only the projector writes a Published row, keyed idempotently by commit sha.
2. Publishing is one Git Data API commit (blobs → tree → commit → ref `force:false`); the editor-supplied expected-`sha` is the lost-update check, a stale one surfaces `409 reload-and-merge`.
3. All saves are idempotent `PUT` with client `Idempotency-Key` (UUIDv7 per explicit save, 24h replay); the loop is save-path fast-project plus deploy full-project from its checkout, and the deploy performs the projection and blocks on its failure.
4. Delete the divergence subsystem (page, report, snapshot, gate, badge, banner, scripts, `snapshots` seam member, `0006` drops `main_snapshots`); `diffArticleStores` survives only as a projector property test.

## Considered Options
- Fully D1 with static output from D1: rejected, loses git history/rollback and makes builds depend on live DB.
- Fully git (drafts as branches/PRs): rejected per ADR-0008/0009, PR noise and 5-request publish dance.
- Worker previews with no status: rejected, published reads stay static from `main` and bytes stay in `public/uploads/`, no R2.

## Consequences
- No deploy gate or Main Snapshot; bounded staleness (≤1 deploy) is invisible because readers read `main`, never the view.
- Git refusal changes nothing (safe retry same key); git-ok plus D1-fail leaves live Article with stale view repaired by next save or deploy; Actions failure after push leaves `main` ahead of static until next green deploy.
