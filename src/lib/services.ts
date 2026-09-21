import type { DbClient } from "./db";
import { getDb } from "./db";
import { getGithubPat } from "./env";
import { DEFAULT_REPO, HttpGithubContents, type GithubContents } from "./github-contents";
import { getMediaStorage, type MediaStorage } from "./media-storage";
import { createD1LockStore, type LockStore } from "./locks";
import { systemClock, type Clock } from "./clock";
import { createD1PostStore, type PostStore } from "./post-store";
import { createLocalArticleMirror, type ArticleMirror } from "./article-mirror";

export { systemClock, type Clock };

/**
 * The adapters a request needs, resolved once at the edge of the system.
 *
 * Modules downstream accept a `Services` value rather than creating their own
 * dependencies, which is what lets tests substitute an in-memory Contents module,
 * a fake database or a fixed clock.
 *
 * `contents` is null when no GitHub PAT is configured: publishing is then refused
 * rather than silently "succeeding" into a store nobody can see.
 */
export interface Services {
  db: DbClient;
  /** The editorial record, as Post Lifecycle reads and writes it. */
  posts: PostStore;
  /** Concurrency Locks. */
  locks: LockStore;
  /** Local development only: mirrors a saved bundle onto disk. A no-op on Workers. */
  mirror: ArticleMirror;
  contents: GithubContents | null;
  media: MediaStorage;
  clock: Clock;
}

export function createServices(locals?: App.Locals, overrides: Partial<Services> = {}): Services {
  const pat = getGithubPat(locals);
  const db = overrides.db ?? getDb(locals);
  const contents =
    overrides.contents !== undefined
      ? overrides.contents
      : pat
        ? new HttpGithubContents({ pat, repo: DEFAULT_REPO })
        : null;

  const clock = overrides.clock ?? systemClock;

  return {
    db,
    posts: overrides.posts ?? createD1PostStore(db),
    locks: overrides.locks ?? createD1LockStore(db, clock),
    mirror: overrides.mirror ?? createLocalArticleMirror(),
    contents,
    media: overrides.media ?? getMediaStorage(contents),
    clock,
  };
}
