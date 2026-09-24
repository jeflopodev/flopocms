import { inspectDocument, type DocumentProblem } from "blocks/dsl/parser";
import { referencedUploads } from "blocks/insertion";
import type { ArticleWriteModel } from "./article-write-model";
import { toPostRecord } from "./article-write-model";
import type { PostRecord } from "./post-store";
import type { Services } from "./services";

export interface PostBundleData {
  title: string;
  description?: string;
  /** Required: Post Lifecycle decides the publication date, not the serializer. */
  pubDate: string;
  heroImage?: string;
  template?: string;
  defaultWidth?: string;
  wideWidth?: string;
  author?: string;
  draft?: boolean;
  contentMdx?: string;
}

export interface SavePostResult {
  success: boolean;
  status?: number;
  /**
   * What the Document Parser could not resolve in the body. Present on a refusal, and on
   * a save that went through with warnings.
   */
  problems?: DocumentProblem[];
  /** Set on a 423 so the editor can name who holds the Concurrency Lock. */
  lockedBy?: string;
  id?: string;
  slug?: string;
  committedToGitHub?: boolean;
  /**
   * False when main holds the Article but the editorial record could not be written.
   * The Article is live and the record is stale, which a re-save or a re-projection clears.
   */
  projectedToD1?: boolean;
  /** Bundle blob sha and commit sha to base the next save on. */
  sha?: string;
  commitSha?: string;
  statusState?: "draft" | "published";
  message?: string;
  updated_at?: string;
  error?: string;
}

export interface DeletePostResult {
  success: boolean;
  status?: number;
  /** True when main had a bundle to remove. False when there was nothing there. */
  deletedFromGitHub: boolean;
  error?: string;
}

/**
 * Pure function: formats an Article's attributes into the Post Bundle's frontmatter and body.
 *
 * The file it produces is still `index.mdx` — that name is the content collection's, not this
 * module's — but what it writes is the JSX Block DSL, which is why neither this function nor
 * its input is named for Markdown any more.
 *
 * Zero side-effects and no clock of its own: a serializer that reached for the current time
 * was a fourth place the present moment was read, in a module already handed one.
 */
export function serializePostBundle(data: PostBundleData): string {
  const {
    title,
    description = "",
    pubDate,
    heroImage = "",
    template = "default",
    defaultWidth = "60rem",
    wideWidth = "70rem",
    author = "jeflopo",
    draft = true,
    contentMdx = "",
  } = data;

  const today = pubDate.split("T")[0];
  const safeTitle = title.replace(/'/g, "''").replace(/[\r\n]+/g, " ").trim();
  const safeDesc = description.replace(/'/g, "''").replace(/[\r\n]+/g, " ").trim();
  const heroLine = heroImage ? `heroImage: '${heroImage.replace(/'/g, "''")}'\n` : "";
  const templateLine = `template: '${template || "default"}'\n`;
  const defaultWidthLine = `defaultWidth: '${defaultWidth || "60rem"}'\n`;
  const wideWidthLine = `wideWidth: '${wideWidth || "70rem"}'\n`;

  return `---\r\ntitle: '${safeTitle}'\r\ndescription: '${safeDesc}'\r\npubDate: '${today}'\r\n${heroLine}${templateLine}${defaultWidthLine}${wideWidthLine}author: '${author}'\r\ndraft: ${draft}\r\n---\r\n\r\n${contentMdx || ""}\r\n`;
}

/**
 * What a body the Document Parser could not fully resolve means for this save.
 *
 * A block the Document Renderer can only wrap in a fallback refuses both statuses: that is
 * what puts a stray `<div class="block-ul">` in front of a reader. Props that fell back to
 * their defaults only refuse a publish, so a half-typed block never costs an Editor the
 * rest of a draft.
 */
function refuseUnrenderableBody(problems: DocumentProblem[], isDraft: boolean): SavePostResult | null {
  const withCount = (problems: DocumentProblem[]) =>
    problems.length > 1 ? ` (and ${problems.length - 1} more)` : "";

  const unrenderable = problems.filter((problem) => problem.severity === "unrenderable");
  if (unrenderable.length > 0) {
    return {
      success: false,
      status: 422,
      problems,
      error: `Cannot save: ${unrenderable[0].message}${withCount(unrenderable)}.`,
    };
  }

  const suspect = problems.filter((problem) => problem.severity === "suspect");
  if (!isDraft && suspect.length > 0) {
    return {
      success: false,
      status: 422,
      problems,
      error: `Cannot publish: ${suspect[0].message}${withCount(suspect)}.`,
    };
  }

  return null;
}

/**
 * Orchestrates post saving: validating invariants, checking Concurrency Locks,
 * serializing MDX, and coordinating Git Sync publishing with D1 persistence.
 *
 * Dependencies are accepted rather than created, so the whole publish/unpublish
 * transition can be exercised against an in-memory Contents module and a fixed clock.
 */
export async function savePostLifecycle(options: {
  /** Already parsed into a write model; every field below is filled in. */
  payload: ArticleWriteModel;
  actor: { id: string; username?: string };
  services: Services;
}): Promise<SavePostResult> {
  const { payload, actor, services } = options;
  const { posts, locks, mirror, contents, clock, contentDir, uploadsDir } = services;

  const { id, slug, title, status } = payload;

  if (!id || !slug || !title) {
    return { success: false, status: 400, error: "ID, slug, and title are required" };
  }

  const cleanSlug = slug.trim().toLowerCase();
  const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!SLUG_REGEX.test(cleanSlug)) {
    return {
      success: false,
      status: 400,
      error: "Invalid post slug format. Must be lowercase alphanumeric with hyphens.",
    };
  }

  // 1. Verify pessimistic concurrency lock
  const lockStatus = await locks.status(id, actor.id);
  if (lockStatus.locked) {
    return {
      success: false,
      status: 423,
      lockedBy: lockStatus.lock?.username,
      error: `Cannot save: Post is currently locked by @${lockStatus.lock?.username || "another editor"}.`,
    };
  }

  const now = clock.now().toISOString();
  const author = payload.author || actor.username || "jeflopo";
  const isDraft = status === "draft";

  // 2. Check slug uniqueness
  const existing = await posts.find(id);

  if (existing && (await posts.slugTaken(cleanSlug, id))) {
    return {
      success: false,
      status: 409,
      error: `Slug "${cleanSlug}" is already used by another post.`,
    };
  }

  // 3. The body has to be a document the Document Renderer can render. Its own validation
  //    runs at insertion and never again, so a hand-typed tag would otherwise publish as
  //    whatever the renderer's fallback emits.
  const inspection = inspectDocument(payload.content_mdx);
  const refusal = refuseUnrenderableBody(inspection.problems, isDraft);
  if (refusal) return refusal;

  // 4. The editorial record the write model describes, with its timestamps decided here
  const record = toPostRecord(payload, { existing, now, author });

  // 5. Serialize the Post Bundle
  const bundle = serializePostBundle({
    title: record.title,
    description: record.description,
    pubDate: record.pubDate,
    heroImage: record.featuredImage,
    template: record.template,
    defaultWidth: record.defaultWidth,
    wideWidth: record.wideWidth,
    author: record.author,
    draft: isDraft,
    contentMdx: record.contentMdx,
  });

  // 6. The write path follows the authority: `main` holds published content, so the bundle
  //    is committed before the editorial record claims the Article is published, and
  //    removed before the record calls it a Draft again. A refused commit therefore
  //    changes nothing rather than leaving a row no reader can see.
  const targetPath = `${contentDir}/${record.slug}/index.mdx`;
  let committedToGitHub = false;
  let lastCommitSha: string | undefined;
  let message = "";

  const wasPublished = existing?.status === "published";

  const expectedSha = payload.expected_sha;
  const expectedRef = payload.expected_ref;
  const bundleDir = `${contentDir}/${record.slug}`;

  if (isDraft && wasPublished) {
    if (!contents) {
      return {
        success: false,
        status: 503,
        id,
        slug: record.slug,
        error:
          "Cannot move this Article back to a Draft: no GitHub PAT is configured, so the published bundle on main cannot be removed.",
      };
    }

    if (expectedSha !== undefined) {
      const current = await contents.readFile(targetPath);
      const currentSha = current?.sha ?? null;
      if (currentSha !== expectedSha) {
        return {
          success: false,
          status: 409,
          id,
          slug: record.slug,
          error: `Nothing changed: "${record.slug}" moved on main. Reload and merge.`,
        };
      }
      if (currentSha === null) {
        message = "Unpublished! Post moved back to draft in D1.";
      } else {
        const unpublish = await contents.deleteDirectory(bundleDir, {
          message: `feat(blog): unpublish "${title}" (moved to draft)`,
          baseRefSha: expectedRef,
        });

        if (!unpublish.success) {
          console.error("GitHub unpublish error:", unpublish.error);
          return {
            success: false,
            status: unpublish.conflict ? 409 : 502,
            id,
            slug: record.slug,
            error: unpublish.conflict
              ? `Nothing changed: "${record.slug}" moved on main. Reload and merge.`
              : `Nothing changed: main refused to remove the published bundle (${unpublish.error}).`,
          };
        }

        message = "Unpublished! Post moved back to draft in D1.";
      }
    } else {
      const unpublish = await contents.deleteDirectory(bundleDir, {
        message: `feat(blog): unpublish "${title}" (moved to draft)`,
      });

      if (!unpublish.success) {
        console.error("GitHub unpublish error:", unpublish.error);
        return {
          success: false,
          status: unpublish.conflict ? 409 : 502,
          id,
          slug: record.slug,
          error: unpublish.conflict
            ? `Nothing changed: "${record.slug}" moved on main. Reload and merge.`
            : `Nothing changed: main refused to remove the published bundle (${unpublish.error}).`,
        };
      }

      message = "Unpublished! Post moved back to draft in D1.";
    }
  } else if (isDraft) {
    message = "Draft saved successfully to D1.";
  } else {
    if (!contents) {
      return {
        success: false,
        status: 503,
        id,
        slug: record.slug,
        error: "Cannot publish: no GitHub PAT is configured, so there is no main to publish to.",
      };
    }

    if (expectedSha !== undefined) {
      const current = await contents.readFile(targetPath);
      const currentSha = current?.sha ?? null;
      if (currentSha !== expectedSha) {
        return {
          success: false,
          status: 409,
          id,
          slug: record.slug,
          error: `Nothing was published: "${record.slug}" moved on main. Reload and merge.`,
        };
      }
    }

    // Uploads commit at upload time and deletes commit at delete time, so a file
    // the bundle references but `main` does not have means someone deleted it after
    // it was inserted. Refuse rather than ship a reader a broken image or download.
    const neededUploads = referencedUploads({
      contentMdx: record.contentMdx,
      featuredImage: record.featuredImage,
    });
    if (neededUploads.length > 0) {
      const listed = await contents.listDirectory(uploadsDir);
      if (!listed.success) {
        console.error("GitHub uploads listing error:", listed.error);
        return {
          success: false,
          status: 502,
          id,
          slug: record.slug,
          error: `Nothing was published: could not verify asset bytes on main (${listed.error}).`,
        };
      }
      const present = new Set(
        (listed.paths ?? []).map((entry) => entry.split("/").filter(Boolean).pop() as string)
      );
      const missing = neededUploads.filter((name) => !present.has(name));
      if (missing.length > 0) {
        const quoted = missing.map((name) => `"/uploads/${name}"`).join(", ");
        return {
          success: false,
          status: 422,
          problems: inspection.problems,
          id,
          slug: record.slug,
          error:
            `Cannot publish: ${quoted} ${missing.length === 1 ? "is" : "are"} referenced ` +
            `but absent on main (deleted?). Re-upload ${missing.length === 1 ? "it" : "them"} or remove the reference.`,
        };
      }
    }

    const commit = await contents.commitFiles([{ path: targetPath, content: bundle }], {
      message: `feat(blog): publish "${title}" by @${author}`,
      baseRefSha: expectedRef,
    });

    if (!commit.success) {
      console.error("GitHub commit to main error:", commit.error);
      return {
        success: false,
        status: commit.conflict ? 409 : 502,
        id,
        slug: record.slug,
        error: commit.conflict
          ? `Nothing was published: "${record.slug}" moved on main. Reload and merge.`
          : `Nothing was published: GitHub refused the commit (${commit.error}).`,
      };
    }

    committedToGitHub = true;
    lastCommitSha = commit.commitSha;
    message = "Published to main on GitHub & saved to D1.";
  }

  // 7. The projection: the record now describes what main holds. A projection that fails
  //    leaves the Article live with a stale record, which is the failure worth having —
  //    the next save repairs it, and nothing a reader can see is wrong.
  let projectedToD1 = true;
  try {
    await posts.save(record);
  } catch (err: any) {
    projectedToD1 = false;
    console.error("Editorial record projection failed:", err);
    message = isDraft
      ? "Removed from main. The editorial record still says published — re-project it to repair."
      : "Published to main. The editorial record is stale — re-project it to repair.";
  }

  // 8. Local development mirror, so the content collection sees the saved bundle
  await mirror.write(record.slug, bundle);

  // Fresh base for the next save: the blob just written, or null when it is gone.
  let freshSha: string | null | undefined;
  if (committedToGitHub && contents) {
    try {
      freshSha = (await contents.readFile(targetPath))?.sha ?? null;
    } catch {
      freshSha = undefined;
    }
  }

  return {
    success: true,
    status: 200,
    id,
    slug: record.slug,
    statusState: status,
    committedToGitHub,
    projectedToD1,
    sha: freshSha ?? undefined,
    commitSha: lastCommitSha,
    message,
    problems: inspection.problems,
    updated_at: now,
  };
}

/**
 * Coordinates post deletion across Cloudflare D1, the published bundle on main,
 * and the local filesystem.
 */
export async function deletePostLifecycle(options: {
  id: string;
  services: Services;
}): Promise<DeletePostResult> {
  const { id, services } = options;
  const { posts, mirror, contents, contentDir } = services;

  if (!id) {
    return { success: false, deletedFromGitHub: false, error: "Missing post ID" };
  }

  const record = await posts.find(id);
  const slug = record?.slug?.trim().toLowerCase();
  const wasPublished = record?.status === "published";

  // 1. Main first, as publishing does: the bundle goes before the record that describes it,
  //    so a refusal leaves an Article readers and the dashboard still agree about.
  let deletedFromGitHub = false;
  if (slug && (contents || wasPublished)) {
    if (!contents) {
      return {
        success: false,
        status: 503,
        deletedFromGitHub: false,
        error:
          "Cannot delete this Article: no GitHub PAT is configured, so the published bundle on main cannot be removed.",
      };
    }

    const bundle = await contents.deleteDirectory(`${contentDir}/${slug}`, {
      message: `feat(blog): delete "${slug}" bundle`,
    });

    if (!bundle.success) {
      console.error("GitHub bundle deletion error:", bundle.error);
      return {
        success: false,
        status: bundle.conflict ? 409 : 502,
        deletedFromGitHub: false,
        error: bundle.conflict
          ? `Nothing was deleted: "${slug}" moved on main. Reload and merge.`
          : `Nothing was deleted: main refused to remove the bundle (${bundle.error}).`,
      };
    }

    // Shared asset bytes under `public/uploads/` stay: other Articles may reference
    // them, and an upload's commit is its own add. Only the bundle goes.
    // Legacy flat files from before Post Bundles existed
    const legacyMdx = await contents.deleteFile(`${contentDir}/${slug}.mdx`, {
      message: `feat(blog): delete post ${slug}.mdx`,
    });
    const legacyMd = await contents.deleteFile(`${contentDir}/${slug}.md`, {
      message: `feat(blog): delete post ${slug}.md`,
    });

    deletedFromGitHub = Boolean(bundle.deleted || legacyMdx.deleted || legacyMd.deleted);
  }

  // 2. The editorial record goes once main has nothing left to serve
  await posts.remove(id);

  // 3. Local Article mirror cleanup
  if (slug) {
    await mirror.remove(slug);
  }

  return { success: true, deletedFromGitHub };
}

export interface CreateDraftResult {
  success: boolean;
  id?: string;
  slug?: string;
  error?: string;
}

export interface DuplicatePostResult {
  success: boolean;
  newId?: string;
  error?: string;
}

/**
 * Creates a new Draft Article with validated default metadata in the editorial record.
 */
export async function createDraftPost(options: {
  actor: { id?: string; username?: string };
  services: Services;
}): Promise<CreateDraftResult> {
  const { actor, services } = options;
  const { posts, clock } = services;

  const id = crypto.randomUUID();
  let suffix = Math.random().toString(36).substring(2, 7);
  let slug = `untitled-${suffix}`;

  while (await posts.slugTaken(slug, id)) {
    suffix = Math.random().toString(36).substring(2, 7);
    slug = `untitled-${suffix}`;
  }

  const now = clock.now().toISOString();
  const author = actor.username || "jeflopo";

  const draft: PostRecord = {
    id,
    slug,
    title: "Untitled Article",
    description: "",
    category: "General",
    tags: "[]",
    author,
    featuredImage: "",
    contentMdx: "",
    status: "draft",
    template: "default",
    defaultWidth: "60rem",
    wideWidth: "70rem",
    pubDate: now,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await posts.save(draft);
    return { success: true, id, slug };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create draft post" };
  }
}

/**
 * Duplicates an existing Article as a new Draft with unique slug and (Copy) title.
 */
export async function duplicatePostLifecycle(options: {
  id: string;
  services: Services;
}): Promise<DuplicatePostResult> {
  const { id, services } = options;
  const { posts, clock } = services;

  if (!id) {
    return { success: false, error: "Missing post ID" };
  }

  const original = await posts.find(id);
  if (!original) {
    return { success: false, error: "Post not found" };
  }

  const newId = crypto.randomUUID();
  let suffix = Math.random().toString(36).substring(2, 6);
  let slug = `${original.slug}-copy-${suffix}`;

  while (await posts.slugTaken(slug, newId)) {
    suffix = Math.random().toString(36).substring(2, 6);
    slug = `${original.slug}-copy-${suffix}`;
  }

  const now = clock.now().toISOString();

  const copy: PostRecord = {
    ...original,
    id: newId,
    slug,
    title: `${original.title} (Copy)`,
    // A copy is never born published.
    status: "draft",
    pubDate: now,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await posts.save(copy);
    return { success: true, newId };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to duplicate post" };
  }
}

export const duplicatePost = duplicatePostLifecycle;

