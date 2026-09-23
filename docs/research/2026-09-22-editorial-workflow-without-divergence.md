# An Editorial Workflow with no Article Store Divergence

**Question.** Drafts live in D1, publishing commits to `main`. Can the two be arranged so that
being out of step is *unrepresentable* rather than *detected* — so the Admin Dashboard's
Divergence page, the Main Snapshot, and the Deploy Gate all become unnecessary?

**Answer, in one paragraph.** Yes, and the whole of it follows from one rule: **every fact gets
exactly one writer, and everything derived from that fact is disposable.** The current design
gives the published-ness of an Article two writers — the save path writes a `status` of
`published` into the Editorial Record, and the projection derives it again from `main`. Four
divergence kinds are not four bugs; they are the four ways two writers can disagree about one
fact. Remove the second writer — make the D1 side of a published Article a materialized view
that is *only* ever rebuilt from `main`, never authored — and Article Store Divergence stops
being a state the system can hold. What remains is bounded staleness, which no reader can see
and a loop repairs. This is the same shape as GitOps (a control loop continuously reconciles
observed state to the declarative desired state in Git), of CQRS read models (a view that is
"completely disposable because it can be entirely rebuilt"), and of the transactional outbox
(never two authorities for one fact; one write, then a retrying projection of it).

This note is written against the vocabulary in `CONTEXT.md` and the decisions in
`docs/adr/0009-*`, `0010-*` and `0011-*`.

---

## 1. The diagnosis: `posts.status` has two writers

Two things are true of the D1 `posts` row today, and they are the root cause:

1. `scripts/savePostLifecycle` (`src/lib/post-lifecycle.ts`, step 7) writes the row **the Editor
   authored**: `status: "published"`, `contentMdx`, `title` — whatever the request said.
2. `src/lib/article-projection.ts` writes the same row **derived from `main`**: a re-projection
   rewrites it from the Post Bundle so "the row now describes what main holds".

One fact — *this Article is published, and this is its content* — has two writers. Everything in
`diffArticleStores` (`src/lib/article.ts`) is a consequence, and each kind corresponds to one way
the writers can fail to agree:

| Kind | Which writer won |
|---|---|
| `missing-from-main` | the save path wrote `published`; `main` has no bundle |
| `missing-from-d1` | the projection never ran (or the row was deleted); `main` has a bundle |
| `content-differs` | both wrote content; they differ |
| `status-differs` | the save path wrote `draft`; `main` still serves it |

ADR-0011's amendment already moved the *order* of those two writes so the safer one loses — commit
first, project second — and that closed `missing-from-main` for the ordinary path. But ordering
does not remove the second writer; it only chooses which divergence you get when something fails.
The dual-write literature is explicit that reordering is an anti-pattern and not a solution:
"Reordering the operations won't work because we need them to be atomic, no matter what order they
occur. Either both operations succeed, or they both fail." ([Confluent, *Understanding the
Dual-Write Problem and Its Solutions*](https://www.confluent.io/blog/dual-write-problem/); the same
argument is in [microservices.io's Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)
and [AWS Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html).)

There is a precedent worth naming, and it is the same disease in a different CMS. Sanity docs warn
that `_updatedAt` "stops being a publish signal as soon as something writes outside the publish
flow" — a maintenance script that touches published documents "makes every one of them look freshly
published", and their advice is to model the publish date as a field only the publish flow writes.
([Sanity, *Drafts*](https://www.sanity.io/docs/content-lake/drafts).) Our `status` and `contentMdx`
are exactly the fields that two flows write.

Two secondary defects live in the same seam and are worth fixing while it is open:

- **The GitHub write is not a compare-and-swap.** `HttpGithubContents.putFile` reads the current
  blob sha and then PUTs that sha — so it always writes over whatever it just read, and a concurrent
  publish by someone else is silently absorbed. The sha that *should* be sent is the one the Editor
  loaded. The Contents API's `sha` parameter exists for exactly this ("The blob SHA of the file being
  replaced"), and a stale one is rejected with `409 Conflict`, which is the lost-update check.
  GitHub also warns that PUT and DELETE "in parallel ... will conflict and you will receive errors.
  You must use these endpoints serially instead."
  ([GitHub, *REST API endpoints for repository contents*](https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28).)
  The Concurrency Lock protects two Editors in the Admin; it does not protect the repository.
- **A publish is not one commit.** An Article plus newly uploaded Assets is several `putFile` calls
  (`src/lib/media-storage.ts` commits to `public/uploads/`), so a failure partway leaves `main` in a
  state that is neither the old Article nor the new one. GitHub's atomic route is the Git Data API:
  create blobs, create a tree, create a commit, then update the ref; and the ref update itself is
  the atomic, conflict-checked step, because `force: false` "make[s] sure the update is a
  fast-forward update".
  ([GitHub, *REST API endpoints for Git references*](https://docs.github.com/en/rest/git/refs?apiVersion=2022-11-28);
  the blob→tree→commit→ref sequence is what the Git Data API exists for —
  [Git database discussion](https://github.com/orgs/community/discussions/166611).)

---

## 2. The principles that do the work

**P1 — One writer per fact.** No fact may be written by two flows. This is the whole game; the other
principles are how you live with it.

**P2 — Derived state is disposable.** A materialized view "is completely disposable because it can
be entirely rebuilt from the source data stores. A materialized view is never updated directly by
an application, and so it's a specialized cache." ([Azure Architecture Center, *Materialized View
pattern*](https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view).)
Azure's list of when *not* to use it is also the honest test of this design: "Consistency is a high
priority" is a reason to avoid it — which is fine here, because the surface that needs consistency
is the published site, and that is built from `main`, not from the view.

**P3 — There is no atomic write across two stores, so make the second write retryable instead.**
Accepted answers, per microservices.io's outbox pattern and Confluent's article, are: an outbox row
written in the *same* transaction as the business change, an event-sourced log, or listening to
your own commit (CDC). All three share one property: the second write is **idempotent** and is
**retried until it lands**. microservices.io states the requirement directly: the relay "might
publish a message more than once ... a message consumer must be idempotent, perhaps by tracking the
IDs of the messages that it has already processed." Cloudflare's queue docs say the same for our
stack: at-least-once by default, so "generat[e] a unique ID when writing the message ... and us[e]
that as the primary key on database inserts and/or as an idempotency key to de-duplicate the message
after processing." ([Cloudflare Queues, *Delivery guarantees*](https://developers.cloudflare.com/queues/reference/delivery-guarantees/).)
For us the unique ID is already minted: it is the **commit sha**.

**P4 — Convergence is a loop, not a page.** A Kubernetes controller "is a control loop that watches
the state of your cluster, then make[s] or request[s] changes where needed. Each controller tries to
move the current cluster state closer to the desired state." ([Kubernetes, *Controllers*](https://kubernetes.io/docs/concepts/architecture/controller/).)
The loop is level-triggered — it compares full current state to full desired state, so "it doesn't
matter if the overall state is stable or not" and missed events are self-correcting. GitOps names
the same thing as a principle: "Software agents continuously observe actual system state and attempt
to apply the desired state." ([OpenGitOps, GitOps Principles v1.0.0](https://opengitops.dev/).)
Argo CD is the worked example of the write discipline that makes such a loop safe: automatic sync
"will only attempt one synchronization per unique combination of commit SHA1 and application
parameters", and self-heal re-attempts it on a timer (default 120s with jitter) rather than on an
event it might miss. ([Argo CD, *Automated Sync Policy*](https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/).)

Under P1–P4 a *report* is the wrong artifact: a page that tells you the loop has not converged is a
loop that is not running. You replace it with the loop, and with a log line for when the loop itself
fails repeatedly.

**P5 — Make the illegal state unspellable.** The deletion test, from this repo's architecture
vocabulary: does deleting the shared `status` concentrate complexity or just move it? It
concentrates. Today "is this published?" is a boolean in a row that an editor, a save route, a
re-projector and the deploy can each set. After the change it is a *directory that exists or does
not*, and the D1 side is a cache of it. A future contributor cannot reintroduce divergence by
writing the wrong value into a column that no longer exists.

---

## 3. What the design looks like

The three stores keep their jobs; only the *authorship* of the D1 copy changes.

```
main (Git)            — authoritative for everything a reader sees.
                        "Published" = a Post Bundle exists at src/content/blog/<slug>/.
                        Written only by Post Lifecycle, in one atomic commit.

D1 drafts             — authoritative for unpublished Articles (ADR-0011 decision 2).
                        Written only by the Article Editor. Has no published-ness to record.

D1 published view     — a materialized view of main. Written only by the projector.
                        Never authored, never repaired, never compared. Disposable.
```

1. **The Editorial Record loses the published half.** A Draft is a row with no bundle. The moment a
   bundle exists on `main`, the row is either deleted (the draft was consumed by publication) or
   marked by the projector as a projection — the mechanism is an implementation choice; the
   invariant is that **no code path writes "this is published" and a bundle at the same time.**
2. **Publishing is one atomic commit.** Bundle + any new Assets land in a single commit via blobs →
   tree → commit → ref update with `force: false`. Either `main` reflects the whole Article or none
   of it; nothing in between exists to be lost. The ref update is also the concurrency check
   (§1, second defect).
3. **The projection is keyed by the commit sha and runs from two places, both idempotent.** The save
   path projects the exact bundle it just committed (cheap, shrinks the window to a round trip); the
   deploy re-derives the whole published set from the checkout it already has — `pnpm review:collect`
   and `scripts/persist-main-snapshot.mjs` already do 90% of this. Re-running either for the same
   revision writes the same rows, so duplicates and retries are free, exactly as Argo CD's
   once-per-revision rule assumes.
4. **No deploy gate, no Main Snapshot, no Divergence page.** The deploy stops *checking* the two
   stores against each other and starts *performing* the projection that makes them agree. Main
   Snapshot exists only because the runtime could not see `main`; once the deploy is the writer, it
   does not need to publish its reading to the Worker. `diffArticleStores` retires — or survives as
   a property test asserting the projector is idempotent and total, which is a better use for it
   than a page nobody opens.
5. **`main` is still the only thing readers see.** Published pages are statically built from the
   content collection at deploy time; the D1 view serves the Admin Dashboard, Profile & Security
   counts and `RelatedPosts`. Staleness in it is therefore invisible to the public site — which is
   the property that makes "eventually consistent" an honest answer here rather than a euphemism.

### What is irreducible, stated plainly

There is no distributed transaction between GitHub and D1, and there never will be. The window
between "GitHub accepted the commit" and "the view was written" is real; the point of P2–P4 is that
the window holds **one** truth (`main`) plus a **stale copy**, never two competing truths. Every
state-of-the-art answer to the dual-write problem accepts this and shrinks the window; none closes
it. For this system the window is bounded by a Worker round trip on the fast path and by the next
deploy on the slow path, it is invisible to readers, and — because the loop is level-triggered — a
crash *inside* it is repaired by the next loop pass with no operator action.

### If the Worker should own the transition instead of CI

Two Cloudflare primitives fit the outbox role without hand-rolling one:

- **Workflows** — durable multi-step execution with automatic retries where state persists "for
  minutes, hours, or even weeks", which makes the transition *commit → project → project again if
  it failed* a durable, resumable unit rather than a sequence of promises in one request.
  ([Cloudflare Workflows](https://developers.cloudflare.com/workflows/).)
- **A push webhook** — GitHub posts every commit with an `X-Hub-Signature-256` HMAC over the body
  for verification, so the Worker can project exactly the revision that landed instead of polling.
  ([GitHub, *Validating webhook deliveries*](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries),
  [*Webhook events and payloads*](https://docs.github.com/en/webhooks/webhook-events-and-payloads#push).)
  This is the "listen to your own commit" answer to the dual-write problem, and it preserves the
  P4 property as long as the webhook stays a *trigger* for the same idempotent reconcile, not a
  replacement for it.

Neither is required for the design to work; the deploy is already a reliable loop trigger because
every publish to `main` starts it (`.github/workflows/deploy.yml`). Reach for Workflows only if the
sub-minute freshness of the Admin view matters.

---

## 4. Options considered

**A. Projection-only D1 (recommended).** As above. Strongest guarantee: divergence is unspellable.
Cost: the Admin list reads from two sources (it already does, through the Article Read Model), and
the publish path gains a step (the atomic commit).

**B. Keep one `posts` table, hand `status` to the projector.** The projector becomes the only writer
of the published half of a row. Smaller diff — no table split, `find`/`save` keep working — but the
guarantee weakens from "cannot happen" to "cannot happen unless someone adds a third writer", which
is precisely the regression that produced today's page. Worth naming as the pragmatic middle if the
table split looks expensive once measured.

**C. Drafts in Git too** (Decap/Netlify CMS's editorial workflow, where a draft is a branch and a PR
and publishing is the merge). One store, so divergence is trivially impossible — but ADR-0008
already recorded why this repo stopped: PR noise on every keystroke, a five-request publish dance,
misleading `[Draft]` commits on `main`. Re-opens a decided question for no new reason.

**D. Everything in D1, Git as a build artifact** (the shape most CMSes actually use; Sanity's
`drafts.`-prefixed documents and perspectives are the mature version). Single store, so no
divergence class at all — but it is the reading ADR-0011 explicitly rejected, and it would make the
build output derived from the database rather than the database derived from the published
artifact. Listed for completeness; not a candidate on its merits here.

---

## 5. Sketch of the change

Deleted: `src/pages/admin/divergence.astro`, `src/pages/api/admin/divergence/reproject.ts`,
`src/lib/main-snapshot.ts`, `src/lib/divergence-report.ts`, `migrations/0004_create_main_snapshots.sql`
(add a `0006` dropping the table), the `snapshots` member of `Services`, the sidebar badge in
`AdminLayout.astro`, the posts-list banner, and the `Article Store divergence check` step in
`deploy.yml` — whose `review:persist` sibling becomes the projector instead.

Changed: `post-lifecycle.ts` publishes through one atomic commit and projects the revision it just
wrote; `github-contents.ts` learns the Git Data API commit and sends the sha it read as a
precondition instead of re-reading; `deploy.yml`'s collect step writes the published view rather
than a snapshot; `post-store.ts` gains/loses whatever the table split requires; and `CONTEXT.md`'s
**Article Store Divergence** and **Main Snapshot** entries are deleted, because a term for a defect
the system cannot hold is a term that will invite the defect back.

New ADR, extending ADR-0011: *the D1 half of a published Article is a materialized view of `main`,
written only by the projector; `main` is the sole writer of published-ness; publishing is one atomic
commit; convergence is a loop, not a page.* This supersedes ADR-0011 decision 3's promise of a
dashboard surface and its amendment's re-projection action.

---

## 6. Open questions

1. **Is the Admin's `Posts` row the same row as a Draft row, or a second table?** Both are
   defensible; the second is stronger but touches more of the Post Store. (Options A vs B.)
2. **Who projects on the fast path — the save route or a Workflow?** The save route is simpler; a
   Workflow survives a crash mid-transition without a retry being anyone's job.
3. **Does `RelatedPosts` and the Profile counts accept a view that is stale by up to one deploy?**
   If not, that read moves to GitHub at request time, which is a real cost worth measuring before
   deciding.
4. **Do we delete `diffArticleStores`, or demote it to a property test of the projector?** Deleting
   it says the class of bug is gone; keeping it as a test says the projector is idempotent. Both
   can be true.

---

## Sources

- [Confluent — Understanding the Dual-Write Problem and Its Solutions](https://www.confluent.io/blog/dual-write-problem/)
- [microservices.io — Pattern: Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)
- [AWS Prescriptive Guidance — Transactional outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)
- [Azure Architecture Center — Materialized View pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view)
- [Azure Architecture Center — CQRS pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs)
- [Kubernetes — Controllers](https://kubernetes.io/docs/concepts/architecture/controller/)
- [OpenGitOps — GitOps Principles v1.0.0](https://opengitops.dev/)
- [Argo CD — Automated Sync Policy](https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/)
- [GitHub — REST API endpoints for repository contents](https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28)
- [GitHub — REST API endpoints for Git references](https://docs.github.com/en/rest/git/refs?apiVersion=2022-11-28)
- [GitHub — Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [GitHub — Webhook events and payloads (push)](https://docs.github.com/en/webhooks/webhook-events-and-payloads#push)
- [Cloudflare — D1 `batch()`, an atomic SQL transaction](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Cloudflare — Queues delivery guarantees (at-least-once, idempotency keys)](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)
- [Cloudflare — Durable Objects (single-writer, strongly consistent storage)](https://developers.cloudflare.com/durable-objects/)
- [Cloudflare — Workflows (durable, retrying multi-step execution)](https://developers.cloudflare.com/workflows/)
- [Cloudflare — Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Sanity — Drafts (`_updatedAt` stops being a publish signal outside the publish flow)](https://www.sanity.io/docs/content-lake/drafts)

*Repository conventions: there was no research-notes directory, so this file establishes
`docs/research/`. It sits beside `docs/adr/` (decisions) and `docs/architecture.md` (the current
shape), and is dated because its claims about the code are true of this revision.*
