import type { DbClient } from "./db";
import { getDb } from "./db";
import { getContentDir, getGithubPat, getUploadsDir } from "./env";
import { DEFAULT_REPO, HttpGithubContents, type GithubContents } from "./github-contents";
import { getMediaStorage, type MediaStorage } from "./media-storage";
import { createD1LockStore, type LockStore } from "./locks";
import { systemClock, type Clock } from "./clock";
import { createD1PostStore, type PostStore } from "./post-store";
import { createD1AssetRegistry, type AssetRegistry } from "./asset-registry";
import { createLocalArticleMirror, type ArticleMirror } from "./article-mirror";
import { createD1EditorAccounts, type EditorAccounts } from "./editor-accounts";
import { createD1IdempotencyStore, type IdempotencyStore } from "./idempotency-store";

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
  /** Media assets and upload metadata. */
  assets: AssetRegistry;
  /** Who the caller is: credentials and sessions. */
  accounts: EditorAccounts;
  /** Idempotent save replay, keyed by client `Idempotency-Key`. */
  idempotency: IdempotencyStore;
  /** Repo-relative Post Bundle base on `main` (per site, via CONTENT_DIR). */
  contentDir: string;
  /** Repo-relative asset bytes base on `main` (per site, via UPLOADS_DIR). */
  uploadsDir: string;
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
  const contentDir = overrides.contentDir ?? getContentDir(locals);
  const uploadsDir = overrides.uploadsDir ?? getUploadsDir(locals);
  const media = overrides.media ?? getMediaStorage(contents, uploadsDir);

  return {
    db,
    posts: overrides.posts ?? createD1PostStore(db),
    locks: overrides.locks ?? createD1LockStore(db, clock),
    mirror: overrides.mirror ?? createLocalArticleMirror(),
    contents,
    media,
    assets: overrides.assets ?? createD1AssetRegistry(db, media),
    accounts: overrides.accounts ?? createD1EditorAccounts(db, clock),
    idempotency: overrides.idempotency ?? createD1IdempotencyStore(db, clock),
    contentDir,
    uploadsDir,
    clock,
  };
}

