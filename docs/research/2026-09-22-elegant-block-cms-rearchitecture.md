# An Elegant Block CMS Rearchitecture: Simpler, Smaller, Harder to Break

**Repo revision:** `be38554bd0faffdcf4ba599b8e004a6645b9cb20` — `2026-09-22 04:01:26 +0200` — `docs: add codebase architecture doc; deepen Post Lifecycle, Asset Registry, and Block Registry`
**Date:** 2026-09-22 (claims are revision-specific; versions read are noted per source)
**Style note:** follows the convention established by `docs/research/2026-09-22-editorial-workflow-without-divergence.md` (question → one-paragraph answer → diagnosis → principles → design → options → sketch → open questions → sources).

---

## Question

This repo (`E:\repos\astro\blog`: Astro headless CMS, git-based + Cloudflare D1 + Workers + static assets, CodeMirror editor without Markdown, JSX DSL / Block-object JSON/AST in the spirit of Notion/Sanity) works today — 21 test files, a deterministic renderer, a documented dual-authority model. But it is also visibly accreting: a 602-line editor page, a 489-line hand parser, a 489-line lifecycle module, a 10-member `Services` seam, a divergence-detection subsystem complete with its own table, snapshot store, dashboard page, API routes, deploy gate step, and sidebar badge. So the question: **how could this have been built more elegantly — simple yet powerful — keeping what is already right, deleting what is scaffolding around a missing invariant, and leaving the smallest possible set of modules where every fact has exactly one writer?**

## Answer in one paragraph

Keep the three decisions that are genuinely load-bearing — the JSX Block DSL as the stored document language (`src/blocks/dsl/`), the single deterministic Document Renderer behind Article Display (`src/lib/article-display.ts` + `src/components/article-display.astro`), and git-`main`-as-truth for published content with D1 for drafts and editorial state (ADR-0009/0011) — because each one replaces a worse alternative the ADRs already rejected (Markdown/regex rendering per [ADR-0010](docs/adr/0010-structured-jsx-block-dsl-and-pluggable-registry.md); PR-branch publishing per [ADR-0009](docs/adr/0009-explicit-editorial-publishing-and-d1-drafts.md); D1-as-truth per [ADR-0011](docs/adr/0011-published-article-authority.md)). Then do four surgical things: (1) **make the D1 half of a published Article a projector-written materialized view and publishing a single atomic Git Data API commit**, which deletes the divergence subsystem instead of extending it (this endorses and concretizes the companion note `docs/research/2026-09-22-editorial-workflow-without-divergence.md`); (2) **keep asset bytes in git (`public/uploads/`) — no R2** per operator constraint (no hard spend caps), but fold all byte writes into the same atomic commit and harden with budgets/GC; (3) **treat CodeMirror transactions as the source of truth** — replace the Markdown language mode with a tiny DSL mode, surface `inspectDocument` as lint, and render block widgets as decorations rather than teaching the author raw angle brackets; (4) **slim the `Services` seam from 10 members to 6 and delete the modules/pages** that exist only to compare two writers against each other. Everything below is a worked-out version of that paragraph, with file paths, primary-source citations, and a phased sketch ordered by leverage-per-diff-line.

> **Amendment 2026-09-22 — no-R2 constraint.** Operator decision: no R2 (or any usage-billed object store) until Cloudflare offers hard spend limits. All R2 recommendations in the original draft are superseded by §3.3a/§3.5/Phase 3 below: bytes stay in git, atomic with the bundle commit.

---

## 1. Codebase diagnosis

Read at this revision: `CONTEXT.md`, `docs/architecture.md`, all 11 ADRs (`docs/adr/0001`-`0011`), `package.json`, `astro.config.mjs`, `wrangler.jsonc`, `src/content.config.ts`, `src/blocks/registry.ts`, `src/blocks/types.ts`, `src/blocks/marks.ts`, `src/blocks/insertion.ts`, `src/blocks/dsl/{parser,renderer,serializer,index}.ts`, sample blocks (`callout`, `youtube`, `image`, `paragraph`, `related-posts`), `src/lib/{post-lifecycle,services,article,github-contents,media-storage,asset-registry,post-store,locks,article-display,article-projection,divergence-report,main-snapshot,article-write-model,asset-rules}.ts`, `src/scripts/editor/{index,editor-session,actions,dom-adapter,asset-modal,lock-manager}.ts`, `src/pages/admin/posts/[id].astro`, `src/pages/admin/posts/[id]/preview.astro`, `src/pages/blog/[...slug].astro`, `src/db/schema.ts`, `migrations/0001/0004/0005`, and the companion note `docs/research/2026-09-22-editorial-workflow-without-divergence.md`.

### 1.1 What's good (keep; these are the deep modules)

1. **The Block Registry shape is right.** `src/blocks/registry.ts` is a `Map<string, BlockDefinition>` plus a tag-to-type alias map, with auto-registration of 12 blocks and `getEditorBlockCards()` deriving the editor drawer from the same definitions — "a new block adds no markup" to `[id].astro` (the `.map((card) => ...)` drawer loop in `src/pages/admin/posts/[id].astro`). `src/blocks/types.ts` gives each block one `schema` (Valibot), one `render`, one `styles`, optional `loadServerData`/`generateJsonLd`, and drawer metadata. This is the correct colocation: the thing the ADRs call "self-contained blocks" ([ADR-0010](docs/adr/0010-structured-jsx-block-dsl-and-pluggable-registry.md), [ADR-0007](docs/adr/0007-global-asset-registry-and-pluggable-blocks.md)). Valibot's own docs describe exactly this pay-for-what-you-use shape — many small independent functions, each with a single task, tree-shaken by the bundler ([valibot.dev/guides/introduction/](https://valibot.dev/guides/introduction/), read 2026-09-22; lib at `valibot@^1.5.0` per `package.json`). Honest note: this is already better than the scattered predecessor (props in `preview.astro`, extraction in a Satteri plugin, snippets in `modal-controller.ts`) that ADR-0010 records.
2. **The Document Renderer + inspector split is right.** `inspectDocument` (recovering, problem-reporting) vs `parseDslToBlocks` (blocks only) vs `renderDocument` (parse, then `loadAllServerData`, then `collectJsonLdEntities`, then `renderBlockNodeSync`, then `getCombinedBlockStyles`) is a clean pipeline in `src/blocks/dsl/{parser,renderer}.ts`, and refusing unrenderable bodies at the lifecycle boundary (`refuseUnrenderableBody` in `src/lib/post-lifecycle.ts`) is the correct enforcement point. This mirrors how serious document systems separate parse-with-recovery from validate-before-commit: ProseMirror's guide makes the same cut between lenient parsing (`DOMParser.fromSchema().parse`) and schema-checked creation (`createChecked`/`check`) ([prosemirror.net/docs/guide/](https://prosemirror.net/docs/guide/), read 2026-09-22).
3. **Article Display as parity-by-construction is right.** `src/lib/article-display.ts` (`articleDisplayPlan(article, mode, articles)`) plus `src/components/article-display.astro` means `/blog/[...slug].astro` (27 lines: build read model over `createGitBundleSource()`, hand to `<ArticleDisplay mode="published">`) and `preview.astro` (D1 source, `mode="preview"`, plus only the preview bar) differ by mode and nothing else — with `article-display.test.ts` asserting byte-identical markup/styles/JSON-LD across modes. Astro's own content model pushes you exactly here: build-time collections (via a `loader` plus `schema` in `src/content.config.ts`, here `glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' })`) are for relatively static content, while live/runtime reads are a different collection kind with explicit tradeoffs — "No MDX support: MDX cannot be rendered at runtime" among them ([docs.astro.build/en/guides/content-collections/](https://docs.astro.build/en/guides/content-collections/), read 2026-09-22). Rendering DSL strings through one module instead of MDX-through-two-pipelines is the correct dodge around that limitation.
4. **Explicit publishing + D1 draft isolation is right.** Zero-autosave/`isDirty` plus `beforeunload`, direct `PUT /contents/.../index.mdx` to `main`, D1-only drafts with SSR preview (`src/lib/post-lifecycle.ts` steps 6-8; `src/scripts/editor/editor-session.ts` phase machine `idle|dirty|saving|saved|error`) ([ADR-0009](docs/adr/0009-explicit-editorial-publishing-and-d1-drafts.md)). The five-request branch-to-commit-to-PR-to-merge-to-delete dance it replaced is documented in the ADR's context section and nobody should reopen it.
5. **The seam discipline is right in spirit.** `Services` ("accept dependencies, don't create them") plus `InMemory*` substitutes and a `FixedClock` give sub-2-second suites across 21 test files. The write model (`src/lib/article-write-model.ts`: one Valibot schema, `toPostRecord` as the single snake_case-to-camelCase meeting point) and the rules modules (`asset-rules.ts` dependency-free and browser-importable; `marks.ts` single mark table; `insertion.ts` single asset-insertion spelling) are each "written once" done correctly.
6. **Locks as courtesy, not safety, is honest.** `createD1LockStore` swallows DB errors and answers permissively ("an unavailable locks table must never block an Editor"; "the lock is a courtesy between two people rather than a safety mechanism"). For two named editors (`jeflopo`/`aflopo` per `CONTEXT.md`) this is the right call — pessimistic UI protection without pretending D1 rows serialize GitHub commits.

### 1.2 What's complex (complexity hotspots, with line counts)

Measured this revision (largest-first sampling): `src/pages/admin/assets/index.astro` (~1127 lines), `src/pages/admin/profile.astro` (~645), `src/lib/post-lifecycle.test.ts` (~532), `src/pages/admin/posts/index.astro` (~499), `src/blocks/dsl/parser.ts` (~489 lines: tokenizer plus `inspectDocument`), `src/lib/post-lifecycle.ts` (~489), `src/lib/editor-accounts.ts` (~373), `src/pages/index.astro` (~324), `src/layouts/AdminLayout.astro` (~320), `src/scripts/editor/dom-adapter.ts` (~335), `src/pages/admin/divergence.astro` (~270), `src/lib/github-contents.ts` (~278), `src/lib/article.ts` (~262), `src/lib/asset-registry.ts` (~274), `src/lib/locks.ts` (~255). Hotspots:

1. **`post-lifecycle.ts` (~489 lines) does four jobs.** Lock check plus slug check plus inspection plus serialization plus GitHub write plus D1 projection plus mirror write plus legacy deletes. Steps 6-8 are really three modules wearing one trench coat: an authorizer (locks/slug/inspect), a committer (GitHub), and a projector (D1). The `projectedToD1: false` flag is the tell — it is a distributed-transactions apology embedded in a return type.
2. **`parser.ts` (~489 lines) is a hand-rolled JSX tokenizer with an expression evaluator.** `tokenizeDsl` hand-scans tag names, attributes, quoted and `{...}` values; `parseJsxExpressionValue` tries `JSON.parse`, then a regex rewrite of JS-object-literal into JSON, falling back to the raw string. Plus `generateNodeId` uses `Date.now()` plus a counter — meaning **parse output is non-deterministic across runs** (ids differ), which quietly forbids snapshot-testing parsed trees and content-addressing blocks. And the renderer has a real asymmetry bug class: `renderInlineSpans` escapes inline text, but the block-children branch drops marks/markDefs for mixed content, and block `render` functions interpolate `props` unescaped (`youtube` title, `image` src/alt, `callout` title, `related-posts` titles) — XSS-adjacent if any prop ever carries author HTML. MDX's own spec warns the format is an odd mix of two languages: markdown is whitespace sensitive and forgiving, JavaScript is whitespace insensitive and unforgiving, it crashes on typos ([mdxjs.com/docs/what-is-mdx/](https://mdxjs.com/docs/what-is-mdx/), modified 2025-01-27, read 2026-09-22) — the hand parser re-inherits exactly that unforgiving half without MDX's micromark-grade tokenizer.
3. **`[id].astro` (602 lines) is a page-shaped editor application.** Server frontmatter (load post, lock status, asset list, tag parsing) plus ~530 lines of drawer/settings/toolbar/modal markup plus two JSON bootstrap scripts plus a boot script. `dom-adapter.ts` (335 lines) then re-queries ~25 element IDs by hand. Two sources of element IDs, zero shared contract — rename an ID in one file and the other fails silently (optional chaining everywhere).
4. **`Services` has 10 members and 3 of them are scaffolding.** `db` (leaks the query builder past the seams it was built to hide — `createD1ArticleSource(services.db)` call sites reach through), `mirror` (dev-only local-fs writer threaded through production signatures), `snapshots` (exists only for the divergence report). The architecture doc's own diagram shows `Services` fanning out to PostStore, LockStore, Media, Contents, Clock plus mirror/assets/accounts/snapshots — the seam is a bag, not an interface.
5. **The divergence subsystem is a second system.** `diffArticleStores` (4 kinds) plus `divergence-report.ts` (report plus `repairArticle` 3 actions) plus `main-snapshot.ts` (store plus in-memory) plus the `main_snapshots` table (`migrations/0004`) plus `divergence.astro` (~270 lines) plus `/api/admin/divergence/*` plus deploy-gate step plus sidebar badge plus `projectArticle` plus `persist-main-snapshot.mjs` plus `collect-article-snapshot.mjs`. The companion note proves these are four spellings of one root cause (`posts.status`/`contentMdx` having two writers) and that reordering (ADR-0011's amendment: commit-first-then-project) only chooses which divergence you get ([`docs/research/2026-09-22-editorial-workflow-without-divergence.md`](2026-09-22-editorial-workflow-without-divergence.md)). Keep the note's diagnosis; this proposal adds the deletion plan and the atomic-commit plus projector-loop construction.
6. **Media goes through Git, one file per commit.** `GitHubMediaAdapter.writeMedia` calls `contents.putFile(public/uploads/...)` with `[skip ci]`; `CompositeMediaAdapter` double-writes (GitHub plus local disk) in non-Worker runtimes; `deleteAsset` deletes bytes-then-row (crash means orphan row or orphan bytes). GitHub's own docs warn: PUT and DELETE in parallel will conflict and you will receive errors; you must use these endpoints serially instead ([docs.github.com/en/rest/repos/contents](https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28), apiVersion `2022-11-28`, read 2026-09-22). Every upload is also a full repo-commit round trip plus a `[skip ci]` prayer — and `public/uploads/` ships inside `./dist` (per `wrangler.jsonc` `assets.directory`), so binaries bloat every deploy.
7. **The editor is CodeMirror-in-name-only.** `src/scripts/editor/index.ts` configures `basicSetup` plus `markdown()` plus line wrapping plus an editable compartment — the Markdown mode for a DSL that explicitly purged Markdown ([ADR-0010](docs/adr/0010-structured-jsx-block-dsl-and-pluggable-registry.md) decision 1). No DSL highlighting, no autocomplete from the registry, no lint from `inspectDocument`, no block widgets — the Blocks drawer inserts raw text snippets and correctness is verified only at save time (HTTP 422 round trip). CodeMirror 6's guide describes precisely the missing pieces as first-class: state as immutable value plus transactions dispatched to the view, compartments reconfigured by transaction, decorations provided through a facet, view plugins for imperative components ([codemirror.net/docs/guide/](https://codemirror.net/docs/guide/), read 2026-09-22).
8. **Duplication at the edges.** `serializePostBundle` hand-builds YAML frontmatter with quote-doubling (a fifth frontmatter writer alongside the content collection schema, the write model, the projection, and the snapshot collector); `deletePostLifecycle` deletes bundle-dir plus legacy `.mdx` plus legacy `.md` (three deletes, three commits); `CompositeMediaAdapter` writes bytes twice; `isDraftVisible()` re-derives environment visibility from 4 env vars; snippet spellings live in block `snippet` plus `insertions` plus the `actions.ts` toolbar list (three insertion vocabularies — though `editor-model.test.ts` at least pins drawer snippets round-trip).

---

## 2. Principles (from primary sources only)

Each principle below is stated, then grounded in the source that owns it. Versions read are recorded so a future reader can tell drift from disagreement.

**P1 — Build-time content wants a loader plus schema; live content is a different kind with explicit costs.** Astro's Content Collections require a `loader` (here `glob({ base, pattern })` in `src/content.config.ts`) and recommend a `schema`; entries are queried with `getCollection()`/`getEntry()` and rendered with `render()` yielding a `<Content/>` component ([docs.astro.build/en/guides/content-collections/](https://docs.astro.build/en/guides/content-collections/), read 2026-09-22; repo uses `astro@^7.3.2`). Live collections fetch their data at runtime with limitations: No MDX support, No image optimization, Performance considerations, No data store persistence (same page). Consequence: the repo is correct to keep published rendering on the build-time collection and correct to avoid MDX-as-runtime; the DSL-string renderer is the right adaptation. Do not "upgrade" to a live D1 collection for published reads.

**P2 — MDX is markdown crossed with JSX with unforgiving edges; if you keep JSX, keep it total.** MDX combines CommonMark with JSX/ESM/expressions; indented code, autolinks, raw `<`, and unescaped `{` all have documented deviations ([mdxjs.com/docs/what-is-mdx/](https://mdxjs.com/docs/what-is-mdx/), modified 2025-01-27). `@astrojs/mdx@8.0.1` (version header on [the MDX integration page](https://docs.astro.build/en/guides/integrations-guide/mdx/), read 2026-09-22) adds `render()` plus `components={{...}}` mapping for custom elements. Consequence: the repo's "JSX-only, no Markdown" DSL is strictly simpler than MDX (no interleaving rules), but only if the parser is total (it is — recovery everywhere) and the renderer escapes everything (it doesn't — section 1.2 item 2). Fix the renderer; keep the language.

**P3 — Static-first on Workers: assets directory plus Worker fallback.** Cloudflare serves `./dist` directly: if a requested URL matches a file in the static assets directory, that file will be served without invoking Worker code; if no matching asset is found and a Worker script is present, the request will be processed by the Worker — with `not_found_handling` (`single-page-application` vs `404-page`) and `run_worker_first` for Worker-first paths ([developers.cloudflare.com/workers/static-assets/](https://developers.cloudflare.com/workers/static-assets/), last updated 2026-07-03). Astro's Cloudflare story matches: static needs no adapter; on-demand (`export const prerender = false`) needs `@astrojs/cloudflare` ([the adapter page, v14.3.2 header](https://docs.astro.build/en/guides/integrations-guide/cloudflare/), read 2026-09-22; repo pins `^14.3.1` with `imageService: 'compile'`; [on-demand rendering](https://docs.astro.build/en/guides/on-demand-rendering/) documents `prerender=false` per route vs `output:'server'`). Consequence: the current hybrid (SSG `/blog`, SSR `/admin/*` plus `/api/*`) is exactly idiomatic — keep it; keep binaries in git `public/uploads/` (shipped in `./dist` per `wrangler.jsonc`) and drafts in D1 behind the Worker, keep prose bundles in the static build. No usage-billed store is introduced.

**P4 — D1 `batch()` is the only atomicity you get; use it for same-store multi-writes.** Batched statements are SQL transactions: if a statement in the sequence fails, it aborts or rolls back the entire sequence ([developers.cloudflare.com/d1/worker-api/d1-database/](https://developers.cloudflare.com/d1/worker-api/d1-database/), last updated 2026-06-22). Consequence: D1-side multi-row work (project row plus delete draft row, lock plus audit) should go through one `batch()`; GitHub-to-D1 can never be one transaction, so don't simulate one with ordering — use P5 instead.

**P5 — No atomic write across two stores; make the second write idempotent and retried.** Queues give at least once delivery by default, recommending a unique ID when writing the message as an idempotency key ([developers.cloudflare.com/queues/reference/delivery-guarantees/](https://developers.cloudflare.com/queues/reference/delivery-guarantees/), last updated 2026-04-21). For long multi-step transitions, Workflows give durable multi-step execution with automatic retries that persists state for minutes, hours, or even weeks ([developers.cloudflare.com/workflows/](https://developers.cloudflare.com/workflows/), last updated 2026-09-18). Sanity's drafts doc is the CMS precedent for one-writer fields: `_updatedAt` moves whenever a document is written to, so it stops being a publish signal as soon as something writes outside the publish flow; model the publish date as a field you control ([sanity.io/docs/content-lake/drafts](https://www.sanity.io/docs/content-lake/drafts), read 2026-09-22). Consequence: one writer per fact (GitHub for published bytes via one atomic commit; projector keyed by commit sha for the D1 view); convergence is a retrying loop, not a dashboard page.

**P6 — GitHub's atomic unit is the Git Data API commit; Contents `sha` is a compare-and-swap you must actually use.** Updating a file requires the blob SHA of the file being replaced with `409 Conflict` on mismatch, and PUT/DELETE must be serial ([Contents API](https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28)). Multi-file atomicity needs blobs-to-tree-to-commit-to-ref-update, where the ref update with `force` omitted or false makes sure you're not overwriting work (fast-forward only) ([Git refs API](https://docs.github.com/en/rest/git/refs?apiVersion=2022-11-28), read 2026-09-22). Consequence: today's `putFile`-then-`deleteFile`-per-asset publish is neither atomic nor CAS-guarded (it re-reads sha then overwrites whatever it just read). Replace with one tree-commit plus `force:false` ref update; send the editor-loaded sha as precondition.

**P7 — Webhooks are triggers, not transports; verify with constant-time HMAC.** GitHub signs each delivery into `X-Hub-Signature-256` as `sha256=` HMAC hex over the body; verify with `crypto.timingSafeEqual`/`hmac.compare_digest`, never `==` ([validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), read 2026-09-22). Consequence: a push webhook may trigger re-projection of the landed sha, but the deploy-time full reconcile stays the correctness backstop (level-triggered loop beats event-triggered hope).

**P8 — CodeMirror 6: functional core, transactions in, decorations out.** State (`@codemirror/state`: immutable doc/state, transactions, compartments, facets) is wrapped by an imperative view (`@codemirror/view`) that syncs DOM from state; extensions compose via facets with precedence; reconfiguration goes through `Compartment.reconfigure` in a transaction; document styling goes through decorations provided through a facet, with directly-provided sets able to affect block structure ([CodeMirror system guide](https://codemirror.net/docs/guide/), read 2026-09-22; repo has `codemirror@^6.0.2`, `@codemirror/state@^6.7.5`). Consequence: the editor's source of truth must become the transaction stream (lint/decorations/autocomplete as extensions), not `doc.toString()` polled at save.

**P9 — Block models converge: typed nodes plus flat annotated inline.** Portable Text (spec v0.0.1 working draft, [portabletext/portabletext](https://github.com/portabletext/portabletext) repo, read 2026-09-22): document is an array of blocks (`_type`/`style`/`children`/`markDefs`/`listItem`/`level`); inline is spans with decorator strings vs annotation keys into `markDefs`. Notion API: every block is `{object:'block', id:UUID, type, [type]:{...}, rich_text:[{annotations:{bold,italic,...}, href}]}` with enumerated types and explicit child-support per type ([developers.notion.com/reference/block](https://developers.notion.com/reference/block), read 2026-09-22). ProseMirror: tree of block nodes plus flat inline sequence with marks-as-metadata, positions as integer offsets, schema content-expressions gating validity ([guide](https://prosemirror.net/docs/guide/)). Slate: pure-JSON `Element{children}` plus custom props, helpers over paths ([docs.slatejs.org/concepts/01-interfaces](https://docs.slatejs.org/concepts/01-interfaces), read 2026-09-22). Consequence: the repo's `BlockNode{id,type,props,children}` plus `InlineSpan{text,marks,markDefs}` is exactly the convergent shape — keep it; do not migrate to Portable Text (it would trade a git-diffable string for JSON without gaining collaboration, which needs ProseMirror-grade steps anyway).

**P10 — Validation libraries want `safeParse` at boundaries, schemas beside renderers.** Valibot's non-throwing API (`safeParse`/`is`) plus `InferOutput` types is the documented boundary pattern ([introduction](https://valibot.dev/guides/introduction/); `parse-data` guide). Schema.org gives the JSON-LD vocabulary the renderer already emits (`BlogPosting` with `headline`/`author`/`articleBody` and more — [schema.org/BlogPosting](https://schema.org/BlogPosting), dev version, read 2026-09-22). Consequence: keep Valibot schemas colocated in block definitions and keep `generateJsonLd` per block; move the only remaining unvalidated spill (frontmatter serialization, hero image union) inside the same boundary.

**P11 — Blobs in git are a cost-control choice, so make git atomic and budgeted.** Object storage would take binaries out of the repo, but is rejected by operator constraint: no usage-billed store until hard spend caps exist. So the elegant move is not a new store but a stronger git discipline: (a) bundle + new asset bytes land in **one** Git Data API commit (blobs→tree→commit→ref, `force:false`), never N per-file Contents PUTs; (b) `asset-rules.ts` budgets (2 MB images / 25 MB files) stay the hard ceiling, enforced identically in browser and Worker; (c) content-hash filenames + orphan GC keep the repo from growing without bound. D1 `assets` rows stay the index; `insertionForAsset` spelling stays unchanged.

---

## 3. Proposed elegant design

### 3.1 Content model: keep the JSX string, derive everything else, fix two bugs

**Keep the JSX Block DSL as the stored language. Do not migrate to JSON AST storage, Portable Text, or Markdown.**

- Why string-over-JSON: the bundle lives in git (`src/content/blog/<slug>/index.mdx`); a JSX string diffs, merges, and `git log -p`s cleanly, while a JSON AST turns every copy-edit into array-index noise. The AST already exists as the derived value (`parseDslToBlocks`); persisting both invites exactly the two-writer disease diagnosed in section 1.2 item 5. Portable Text's spec confirms the repo already has its semantics (blocks plus decorator/annotation marks, P9) — adopting its syntax would cost the git ergonomics for no new power (no real-time collaboration exists; that needs operation steps per ProseMirror P9, not a format swap).
- Why not Markdown/MDX: ADR-0010 already purged it; MDX's documented deviations (indented code, autolinks, `<`/`{` escaping per [what-is-mdx](https://mdxjs.com/docs/what-is-mdx/)) are strictly more author-hostile than the current `<Paragraph>` explicitness, and Astro live collections can't render MDX at runtime anyway (P1).
- Migration path: none needed — the language stays. Two correctness fixes land instead:
  1. **Deterministic node IDs.** Replace `Date.now()`-based `generateNodeId` in `src/blocks/dsl/parser.ts` with a content-position-derived id (`${blockType}-${offset}-${siblingIndex}` or a hash of type plus raw text plus index). Pure function of input means snapshot-testable parses, stable keys for decorations (section 3.4), content-addressable blocks for the projector (section 3.3).
  2. **Escape discipline in `renderer.ts`.** Route every `props` interpolation through `escapeHtml`/attribute-escapers (create `escapeAttr`), and unify the two children branches so mixed block-plus-inline children keep marks. Add one test: rendering `<Image>` with an adversarial `alt` must produce no raw `">`.

```ts
// src/blocks/dsl/parser.ts — sketch: deterministic ids
let seq = 0;
export function inspectDocument(dsl: string, opts?: { seed?: number }) {
  seq = opts?.seed ?? 0; // tests pin seed; prod passes article hash
  const nid = (type: string) => `${type}-${(seq++).toString(36)}`;
  // ...use nid() everywhere generateNodeId was used
}
```

```ts
// src/blocks/dsl/renderer.ts — sketch: escape boundary
function escapeAttr(v: unknown): string {
  return escapeHtml(String(v ?? "")).replace(/"/g, "&quot;");
}
// in every block render call-site AND inside block render fns via helper:
// render: (props) => `<img src="${escapeAttr(props.src)}" alt="${escapeAttr(props.alt)}" ...>`
```

Honest counterpoint: a Lezer grammar for the DSL would be more elegant long-term (real incremental parsing, first-class CodeMirror integration per P8). Don't do it now — the hand parser's recovery behavior is load-bearing and tested (`inspect.test.ts`); grammar-izing it is a Phase-3 luxury (section 5, Phase 4), and the lint-via-`inspectDocument` plan (section 3.4) gets 80 percent of the value with 5 percent of the risk.

### 3.2 Rendering: already single — shrink its inputs, harden its contract

Keep `renderDocument` plus Article Display exactly as shaped. Three tightenings:

1. **One `BlockRenderContext`, constructed once.** Today `BlockArticleContext` requires `{id,slug,title,author,category}` and `articleDisplayPlan` builds it — good. Extend the rule: no block reads `ctx.env` or `ctx.articles` shape beyond `ArticleReadModel` (already true for `related-posts`; pin with a type test). Delete the `env?: any` escape hatch from `BlockRenderContext` in `src/blocks/types.ts` — `any` in a context every block receives is a leaky abstraction with a type signature.
2. **CSS/JSON-LD stay colocated** (keep `styles` plus `generateJsonLd` on `BlockDefinition`; keep `getCombinedBlockStyles`). Schema.org conformance check: ensure the emitted `@graph` uses `BlogPosting` plus `headline`/`author`/`datePublished` per [schema.org/BlogPosting](https://schema.org/BlogPosting) — today `blogPosting` sets `@type/headline/author/mentions` but no `datePublished`/`description`/`mainEntityOfPage`; add them in `renderDocument` from `ctx.post` (extend `BlockArticleContext` with `description`, `pubDate`).
3. **Hero image union stays** (`BundledHeroImage | string` plus `isBundledHeroImage` in `src/lib/article.ts`) — it records a real build-vs-editor distinction. Just move its construction into `articleDisplayPlan` so templates never branch.

### 3.3 Persistence: one atomic commit plus projector-owned D1 view (the core change)

Adopt the companion note's Option A (projection-only D1) with the construction made concrete. Facts and writers after the change:

| Fact | Sole writer | Readers |
|---|---|---|
| Published bytes plus metadata | **one Git Data API commit** by Post Lifecycle | build (content collection), projector, GitHub UI |
| Draft bytes | Article Editor via save-draft path | editor, preview |
| Editorial state (locks, sessions, accounts, asset metadata) | respective modules | admin |
| Published view in D1 | **projector keyed by commit sha** (save-path fast plus deploy full) | admin list, counts, `RelatedPosts`, divergence test |

Concretely:

1. **`GithubContents` learns one method: `commitBundle`.** Extend `src/lib/github-contents.ts` (one module owns GitHub — prefer extend over a new file):
   ```ts
   export interface BundleFile { path: string; content: string | Uint8Array; }
   export interface AtomicCommit {
     files: BundleFile[];        // index.mdx plus any new uploads staged together
     baseRef?: string;           // expected main sha (CAS); absent means best-effort
     message: string;
   }
   // POST /git/blobs (xN) -> POST /git/trees -> POST /git/commits -> PATCH /git/refs/heads/main {sha, force:false}
   commitBundle(commit: AtomicCommit): Promise<{ success: boolean; commitSha?: string; error?: string }>;
   ```
   Blobs-to-tree-to-commit-to-ref-update is the Git Data API's reason to exist (P6); `force:false` makes concurrent publishes fail fast with 409 instead of silently interleaving. Contents-PUT stays for single-asset admin actions only.
2. **The save path sends the sha it loaded.** Thread `expectedSha` (from the editor's load — add it to the bootstrap payload in `[id].astro` via `contents.readFile` sha, or `null` for new) through `ArticleWriteModel` into `savePostLifecycle` into `commitBundle`. Stale editor means 409 means HTTP 409 to the client ("someone published while you edited; reload"). The D1 Concurrency Lock stays as the courtesy layer (section 1.1 item 6); the ref-update becomes the safety layer. This fixes the silently-absorbed-concurrent-publish defect the companion note names in its section 1.
3. **D1 published rows become projector-written.** `post-lifecycle.ts` step 7 (`posts.save(record-as-published)`) is deleted. Instead:
   - fast path: after `commitBundle` succeeds, call `projectCommittedArticle(commitSha, bundle)` (parse bundle, then `projectArticle`, then `posts.save`, in one D1 `batch()` together with draft-row deletion per P4);
   - slow path: deploy runs collect-then-project-all from the checkout it already has (`scripts/collect-article-snapshot.mjs` plus `persist-main-snapshot.mjs` rewritten to write rows, not a snapshot blob).
   - Both paths are idempotent on `(slug, commitSha)` — re-running writes the same rows (once-per-revision, P5).
4. **Delete the divergence subsystem.** `src/pages/admin/divergence.astro`, `src/pages/api/admin/divergence/*`, `src/lib/divergence-report.ts`, `src/lib/main-snapshot.ts`, `migrations/0004_create_main_snapshots.sql` (plus a `0006` dropping the table), the `snapshots` member of `Services`, the sidebar badge in `AdminLayout.astro`, the posts-list banner, the deploy-gate `check:divergence` step. Keep `diffArticleStores` only as a property test over the projector (project-then-project equals project; deploy-reconcile agrees with fast-path rows). Keep `repairArticle`'s logic as the projector's upsert — delete its route. `CONTEXT.md` entries **Article Store Divergence** and **Main Snapshot** are deleted with the code (a term for an unrepresentable state invites it back — companion note section 5).
5. **Outbox only if the fast path proves lossy.** Default: save-path projection plus deploy reconcile (every publish triggers a deploy via `.github/workflows/deploy.yml`, so the loop already runs). If admin-list staleness ever matters sub-minute, add a push-webhook trigger (`X-Hub-Signature-256` verified per P7) or a Workflow (`step.do('project', ...)` with retries per P5 and the [Workflows page](https://developers.cloudflare.com/workflows/)) — both trigger the same idempotent reconcile, never a new writer.

What to do about `serializePostBundle`'s hand-YAML: replace string-concat with a small frontmatter builder tested against the content-collection Zod schema (`src/content.config.ts` uses `astro/zod`; the write model uses Valibot — pick one for the boundary test; recommend validating the parsed bundle with the same Valibot article schema in a round-trip test rather than unifying the two libs, which is churn with no behavior change).

### 3.4 Editor: transactions in, DSL extensions on top

Goal: the author never learns angle brackets exist until they want to. Keep explicit save (ADR-0009 — autosave caused the original PR-noise disaster; ProseMirror's transaction model (P9) also assumes intentional dispatches).

1. **Drop `markdown()`; add a minimal DSL mode.** `src/scripts/editor/index.ts` today: `basicSetup` plus `markdown()`. Replace with a `StreamLanguage`-defined `dslLanguage` (~60 lines: block tags, `{...}` expressions, mark tags, comments) for highlighting plus folding. No Lezer grammar yet (section 3.1 counterpoint).
2. **Lint from `inspectDocument` (debounced).** Wire the `linter` facet (`@codemirror/lint` — add the dep) to run `inspectDocument(doc)` off the transaction stream and surface `unrenderable` as errors, `suspect` as warnings, with the tag position mapped from the tokenizer offsets. Save-time 422s become red squiggles while typing. `refuseUnrenderableBody` stays as the server backstop (never trust the client).
3. **Autocomplete from the registry.** Wire `autocompletion` to `getEditorBlockCards()` plus `TOOLBAR_ACTIONS`: typing `<` offers block tags with `snippet` as completion plus info preview; `/` slash-menu inserts `insertions`. This deletes the conceptual gap between Blocks drawer and keyboard authors (same `snippet` strings, section 1.1 item 1).
4. **Block widgets as decorations, read-only where it pays.** Use a `ViewPlugin` plus `Decoration.widget` (P8) to render e.g. `<YouTube id>` as its thumbnail plus title inline (collapsed), `<Image>` as actual image preview, while keeping the DSL text as the stored truth (toggle widget/text on click). Start with YouTube plus Image only — decorations that affect block structure must be directly provided (P8); keep them atomic (`Decoration.replace` with `block:true`) to avoid cursor-mapping bugs.
5. **Contract the DOM adapter.** Generate element IDs from a single `EDITOR_IDS` const in a new `src/scripts/editor/ids.ts` imported by both `[id].astro` (as JSON) and `dom-adapter.ts`. Or better: `readMetadata()` reads a single `<form id="article-settings">` via `FormData` instead of 12 field refs. Either deletes the silent-drift class (section 1.2 item 3). Prefer `FormData` — fewer lines, native semantics.
6. **Keep `EditorSession` untouched.** The phase machine plus `readContent`/`readMetadata`/`persist` injection is the best-isolated client module; `editor-session.test.ts` plus `actions.test.ts` already pin it. Don't churn tested seams.

Slash-menu sketch (tiny, additive):

```ts
// src/scripts/editor/dsl-complete.ts
import { autocompletion } from "@codemirror/autocomplete";
import { getEditorBlockCards } from "../../blocks/registry";
export const dslCompletion = autocompletion({
  override: [async (ctx) => {
    const m = ctx.state.doc.sliceString(Math.max(0, ctx.pos - 1), ctx.pos);
    if (m !== "<" && m !== "/") return null;
    return {
      from: ctx.pos, validFor: /^[A-Za-z]*$/,
      options: getEditorBlockCards().flatMap((c) =>
        c.insertions.map((i) => ({ label: `<${c.tagName}> — ${i.label}`, apply: `\n${i.snippet}\n` }))),
    };
  }],
});
```

### 3.5 Architecture: seams audit — merge / split / delete

| Current | Verdict | Action |
|---|---|---|
| `Services` (10 members) | bag | **Slim to 6:** `{ posts, locks, contents, assets, accounts, clock }` — `assets` already wraps `media`, so `media` goes; drop `db` (no caller should touch Drizzle except the three D1 adapters' constructors), drop `mirror` (dev-only; inject via `contents` decoration in dev entry, not prod signatures), drop `snapshots` (deleted with divergence). |
| `post-lifecycle.ts` | 4 jobs | **Split into 3:** `article-authorize.ts` (lock/slug/inspect to refusal), `article-commit.ts` (bundle build plus `commitBundle`), `article-project.ts` (fast-path projector). `post-lifecycle.ts` becomes a ~60-line orchestrator. Each piece keeps its in-memory testability. |
| `github-contents.ts` | gateway plus substitute | **Keep plus extend** with `commitBundle` (section 3.3 item 1). `InMemoryGithubContents` gains an atomic-commit log plus ref-sha tracking so tests assert atomicity ("one commit for bundle plus assets") and CAS ("stale sha means 409"). |
| `media-storage.ts` | 4 adapters plus composite | **Keep git bytes, delete the double-write.** Keep the `MediaStorage` interface (callers unchanged), keep `GitHubMediaAdapter` but route publish-time writes through `commitBundle` (§3.3 item 1) instead of per-file `putFile`; delete `CompositeMediaAdapter` (the double-write was the bug farm — dev writes via `LocalFs`, prod via GitHub, never both); keep `LocalFs` for dev, `InMemory` for tests. Serving stays `public/uploads/` → `./dist` static. Standalone asset uploads keep Contents-PUT + `[skip ci]`; publish-time assets ride the atomic article commit. |
| `asset-registry.ts` | coordination | **Keep.** Add content-hash filenames (dedupe by sha256, skip re-upload of identical bytes) + orphan GC (`list` unreferenced-by-any-bundle sweep, admin-only delete); bytes-then-row stays (the atomic git commit is the commit; D1 row is the index — document which is truth: git). |
| `article.ts` read model plus `article-sources/*` | two adapters, one seam | **Keep.** This is what makes ADR-0011 decision 4 real ("never a direct query"). Add D1 `batch()` to the D1 source's projector side only. |
| `divergence-report` / `main-snapshot` / `divergence.astro` / `api/divergence` / `0004` | second system | **Delete** (section 3.3 item 4). |
| `article-mirror.ts` | dev-only | **Delete from prod path;** dev preview reads D1 directly already (`preview.astro`); document draft-invisibility in local content collection (drafts preview via SSR regardless). |
| `[id].astro` 602 lines | page-app | **Split:** `editor-shell.astro` (chrome), `settings-panel.astro`, `blocks-panel.astro` (drawer loop), `asset-modal.astro` (dialog), plus `ids.ts`/`FormData` (section 3.4 item 5). No behavior change; each partial gets its props typed. |
| `dom-adapter.ts` | 25 IDs | **Shrink** via section 3.4 item 5. |
| `serializePostBundle` | hand-YAML | **Harden** with round-trip test (section 3.3 end). |
| `isDraftVisible()` | env sniffing | **Keep** (build-time only, ~20 lines, tested implicitly by `article.test.ts` visibility cases). |
| `locks.ts` permissive fallback | courtesy | **Keep.** Optionally add acquire-CAS via a single `INSERT ... ON CONFLICT DO UPDATE ... WHERE expires_at <= now` — one statement instead of select-then-write (P4 spirit, kills the check-then-act race for 2 editors). |

Testing strategy (keep the shape, aim the new tests at the new invariants):

- Keep in-memory substitutes plus `FixedClock` plus the under-2-seconds suite. Add: (a) atomicity — publish with new assets asserts one `commitBundle` containing bundle plus assets; (b) CAS — stale `expectedSha` means 409 and nothing written; (c) idempotent projector — project-of-project equals project, and deploy-reconcile agrees with fast-path rows; (d) parser determinism — same input means same ids; (e) renderer escaping — adversarial props produce no raw `<`; (f) editor lint — `inspectDocument` problems surface as diagnostics (pure function test, no browser); (g) parity — existing `article-display.test.ts` untouched and green.

---

## 4. Options considered (and why not)

**O1. JSON Block AST as stored format (Notion-style persistence).** Notion persists `{object:'block', id, type, [type]:{...}}` with `rich_text` annotations (P9, [Notion block ref](https://developers.notion.com/reference/block)); Slate is pure-JSON `Element{children}` plus custom props ([Slate interfaces](https://docs.slatejs.org/concepts/01-interfaces)). Tempting for "real" block editing. Rejected: every edit becomes JSON-array surgery in git history; the DSL already parses into this exact shape in memory (`BlockNode` is approximately a Notion block, `InlineSpan` approximately a rich-text span); migration rewrites every bundle plus the collection loader for zero author-visible gain. Revisit only if a true visual block editor (ProseMirror-based, P9) replaces CodeMirror text editing — and then the JSON becomes the editor state's serialization, still rendered back to DSL for storage.

**O2. Portable Text adoption.** Spec-conformant (`_type`/`style`/`children`/`markDefs`, decorator-vs-annotation marks per [the spec repo](https://github.com/portabletext/portabletext)) with renderers for React/Svelte/Vue/to-html. Rejected: same git-ergonomics loss as O1, plus a dependency (converters) for what `renderDocument` already does in about 200 dependency-free lines; `@portabletext/*` buys framework renderers this Astro-SSG site doesn't need.

**O3. Full MDX return.** `@astrojs/mdx@8.0.1` plus `components={{...}}` mapping ([MDX integration](https://docs.astro.build/en/guides/integrations-guide/mdx/)) would restore Markdown authoring with custom components. Rejected: reopens ADR-0010's regex-divergence wound; Astro live collections can't render MDX at runtime (P1) so preview/prod parity would need two pipelines again; MDX deviations (section P2) are author-hostile versus explicit tags.

**O4. Everything in D1, git as build artifact (Sanity-shaped).** Sanity's `drafts.`-prefix plus perspectives model ([drafts doc](https://www.sanity.io/docs/content-lake/drafts)) is the mature single-store CMS. Rejected: ADR-0011 explicitly chose git-truth for published content; the static build from git plus edge SSR preview is the deployment's best property (P3); moving truth to D1 makes deploys database migrations and loses `git log` authorship.

**O5. Drafts-in-git branches (Decap-style).** Rejected by ADR-0008 to 0009 history (PR noise, 5-step dance); nothing new (section 1.1 item 4).

**O6. TipTap/Plate visual editor replacing CodeMirror.** TipTap is ProseMirror-based (its docs live under [tiptap.dev](https://tiptap.dev) — the introduction path 404'd on fetch 2026-09-22, so no claim is grounded beyond its ProseMirror lineage via P9). Rejected for now: 2 editors, text-DSL fluency already built, and a WYSIWYG overlay changes the authoring contract (what-you-see vs what-is-stored) that the DSL deliberately keeps explicit. The decorations plan (section 3.4 item 4) is the reversible halfway step — adopt full block-WYSIWYG only after widgets prove out.

**O7. Keep Contents-PUT publishing, just add retries.** Rejected: retries on non-atomic multi-file writes widen the interleaving window (P6 serial-use warning); the Git Data API commit is the same number of lines as the retry wrapper and actually atomic.

---

## 5. Phased refactoring sketch (minimal, high-leverage first)

**Phase 0 — Stop the bleeding (no behavior change, ~1 day).**
- Fix renderer escaping (`escapeAttr` everywhere; unify children branches) plus adversarial test. Why first: a stored-XSS-shaped hole in author-controlled props outranks elegance.
- Deterministic parser ids (counter reset per parse; seed option) plus snapshot tests for 3 sample docs.
- `EDITOR_IDS`/`FormData` for the editor settings form (delete the silent-drift class before splitting the page).

**Phase 1 — Atomic publish plus CAS (~2-3 days, the leverage peak).**
- Add `commitBundle` to `HttpGithubContents` plus `InMemoryGithubContents` (blobs to tree to commit to `PATCH ref {force:false}` per [refs API](https://docs.github.com/en/rest/git/refs?apiVersion=2022-11-28)); thread `expectedSha` from editor bootstrap to write model to lifecycle; map 409 to HTTP 409.
- Collapse publish asset-writes into the same commit (delete per-file `putFile` from the publish path; keep Contents-PUT for standalone asset uploads).
- Tests: one-commit assertion, stale-sha refusal, serial-order log.
- Deletes nothing yet; old path stays behind a flag until green.

**Phase 2 — Projector owns published D1 plus delete divergence (~2 days).**
- Write `article-project.ts` (bundle to `projectArticle` to D1 `batch()` upsert plus draft-row delete, keyed by commit sha, idempotent).
- Rewire deploy: collect to project-all-rows (delete snapshot blob plus `main-snapshot.ts` plus `0004` via new `0006` drop migration).
- Delete: `divergence.astro`, `api/divergence/*`, `divergence-report.ts`, snapshot store, badge/banner/gate-step, `CONTEXT.md` divergence entries, `mirror` from `Services`.
- Keep `diffArticleStores` as projector property test. New ADR (extends 0011): published D1 is a materialized view; publishing is one atomic commit; convergence is a loop.

**Phase 3 — Git-preserving asset hardening, no R2 (~1-2 days).**
- Publish-time asset bytes join the atomic `commitBundle` (bundle + uploads in one commit); standalone uploads keep Contents-PUT + `[skip ci]`; delete `CompositeMediaAdapter`; add content-hash dedupe + orphan-GC admin action; keep `asset-rules.ts` budgets as the spend cap (repo size is the bill, and it is visible in `git count-objects`).
- Keep `asset-registry.ts`, `asset-rules.ts`, `insertion.ts`, `asset-library.ts` interfaces untouched (proves the seams held). R2 remains a documented future option if hard spend caps ever appear — the `MediaStorage` seam is where it would land, with zero DSL migration.

**Phase 4 — Editor depth (~3-5 days, interruptible per item).**
- DSL `StreamLanguage` mode, then lint via `inspectDocument`, then `<`/slash autocomplete from registry, then YouTube/Image decorations, then split `[id].astro` into partials.
- Each ships independently; `EditorSession`/`actions.ts` pinned by existing tests throughout.

**Phase 5 — Seam slimming plus lifecycle split (~2 days).**
- `Services` down to `{ posts, locks, contents, assets, accounts, clock }` (drop `db`/`mirror`/`snapshots`); split `post-lifecycle.ts` into authorize/commit/project; single-statement lock acquire (`INSERT ... ON CONFLICT ... WHERE expired`); frontmatter round-trip test.
- Final: re-run full suite (under-2-seconds budget defended), update `docs/architecture.md` sections 3-6 plus `CONTEXT.md`, record follow-up ADR.

Estimated deletions at completion: ~7 files plus 1 table plus 3 `Services` members plus ~300 lines of page markup factored into partials plus the publish-time per-file git-bytes path (standalone uploads keep Contents-PUT). Estimated additions: ~400 lines (`commitBundle`, projector, DSL mode, lint/complete/decorations) — net negative, and every added line sits behind a seam with an in-memory substitute.

---

## 6. Open questions

1. **Repo-size budget for `public/uploads/`?** No R2 means git is the bill. Set one (e.g. warn at 500 MB / refuse standalone uploads at 1 GB via `git count-objects` in CI + `asset-rules` totals from D1) and let orphan GC enforce it. Revisit object storage only when hard spend caps exist.
2. **Who mints `expectedSha` for brand-new drafts?** `null` (no precondition) is correct for create; the first publish's precondition should be "ref must not contain this slug path" — enforce by checking `readFile` null in `commitBundle` preflight, or accept last-writer-wins for creates only.
3. **Does `RelatedPosts`/admin-list tolerate deploy-bounded staleness?** If yes, ship Phase 2 as specced. If a surface needs read-after-publish, it reads the just-committed bundle through `projectCommittedArticle`'s return value (request-scoped freshness, no new writer).
4. **Lezer grammar: ever?** Only if Phase-4 decorations expose incremental-parse wins worth the recovery-behavior re-proof. Default: no.
5. **Valibot vs `astro/zod` at the content-collection boundary:** leave both (collection schema in Zod per Astro convention at [content-collections](https://docs.astro.build/en/guides/content-collections/); domain validation in Valibot per bundle-size rationale at [Valibot intro](https://valibot.dev/guides/introduction/)); add only the round-trip test, not a unification.

---

## 7. Sources (primary only; versions read 2026-09-22)

- Astro — Content Collections / Content Layer API (build-time `loader` plus `schema`, `glob()`/`file()` loaders, live-collection limits incl. "No MDX support"): https://docs.astro.build/en/guides/content-collections/
- Astro — `@astrojs/mdx` integration page (header: v8.0.1; `render()`/`<Content components>` mapping): https://docs.astro.build/en/guides/integrations-guide/mdx/
- Astro — `@astrojs/cloudflare` adapter page (header: v14.3.2; `imageService` incl. `compile`, sessions/KV, `prerenderEnvironment`, advanced routing): https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- Astro — On-demand rendering (`prerender=false`, adapters, `output:'server'`): https://docs.astro.build/en/guides/on-demand-rendering/
- Astro — Deploy to Cloudflare (Wrangler `assets.directory`, adapter install): https://docs.astro.build/en/guides/deploy/cloudflare/
- Cloudflare — Workers Static Assets (routing: asset-else-Worker; `not_found_handling`; `run_worker_first`; updated 2026-07-03): https://developers.cloudflare.com/workers/static-assets/
- Cloudflare — D1 `D1Database` (`batch()` sequential auto-commit transaction, abort/rollback; updated 2026-06-22): https://developers.cloudflare.com/d1/worker-api/d1-database/
- Cloudflare — Queues delivery guarantees (at-least-once default; idempotency keys; updated 2026-04-21): https://developers.cloudflare.com/queues/reference/delivery-guarantees/
- Cloudflare — Workflows (durable steps, retries, persist minutes to weeks; updated 2026-09-18): https://developers.cloudflare.com/workflows/
- Cloudflare — R2 overview (considered and REJECTED per no-R2-until-spend-caps operator constraint 2026-09-22; the `MediaStorage` seam is where it would land): https://developers.cloudflare.com/r2/
- GitHub — Contents API (`sha` required on update, `409 Conflict`, serial PUT/DELETE; apiVersion `2022-11-28`): https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28
- GitHub — Git refs API (`force` default false means fast-forward-only update): https://docs.github.com/en/rest/git/refs?apiVersion=2022-11-28
- GitHub — Validating webhook deliveries (`X-Hub-Signature-256` HMAC hex, constant-time compare, test vector `It's a Secret to Everybody`): https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
- CodeMirror 6 — System guide (functional core/imperative shell, transactions, compartments, facets, decorations, view plugins): https://codemirror.net/docs/guide/
- Portable Text — Specification v0.0.1 working draft (blocks array, `style`/`markDefs`/`listItem`/`level`, decorator vs annotation marks; repo `portabletext/portabletext`): https://github.com/portabletext/portabletext
- Notion API — Block object reference (`object`/`id`/`type`/`{type}` objects, `rich_text` annotations, child-support matrix): https://developers.notion.com/reference/block
- ProseMirror — Guide (block tree plus flat inline with marks, schema content expressions, steps/transforms/transactions, `createChecked`): https://prosemirror.net/docs/guide/
- Slate — Interfaces (pure-JSON `Element{children}`, custom props, helpers): https://docs.slatejs.org/concepts/01-interfaces
- MDX — What is MDX (markdown crossed with JSX, CommonMark base, documented deviations; modified 2025-01-27): https://mdxjs.com/docs/what-is-mdx/
- Valibot — Introduction (modular no-dep schemas, `safeParse`, bundle-size rationale): https://valibot.dev/guides/introduction/
- Sanity — Drafts (`drafts.` prefix, `_updatedAt`-is-not-a-publish-signal, model publish date yourself): https://www.sanity.io/docs/content-lake/drafts
- Schema.org — `BlogPosting` (dev version; `headline`/`author`/`articleBody`/`datePublished` and more): https://schema.org/BlogPosting
- Repo-local precedent — `docs/research/2026-09-22-editorial-workflow-without-divergence.md` (dual-write diagnosis, one-writer-per-fact, materialized-view/projector-loop proposal this note concretizes)
- Attempted but unusable (recorded, not cited for claims): `https://www.sanity.io/docs/content-lake/presenting-block-text` (404 on fetch); `https://tiptap.dev/docs/introduction` (404 on fetch — TipTap claims grounded via ProseMirror lineage only, hence O6's rejection is provisional).

*Repo versions at read time (from `package.json`): `astro@^7.3.2`, `@astrojs/cloudflare@^14.3.1`, `@astrojs/mdx@^8.0.1`, `codemirror@^6.0.2` plus `@codemirror/state@^6.7.5` plus `@codemirror/lang-markdown@^6.5.2`, `valibot@^1.5.0`, `drizzle-orm@1.0.0-rc.4`, `wrangler@^4.132.0`, compat date `2026-09-16`.*
