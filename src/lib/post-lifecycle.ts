import { inspectDocument, type DocumentProblem } from "../blocks/dsl/parser";
import { BLOG_DIR } from "./article-mirror";
import type { ArticleWriteModel } from "./article-write-model";
import { toPostRecord } from "./article-write-model";
import type { PostRecord } from "./post-store";
import type { Services } from "./services";

export interface PostMdxData {
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
  gitBranch?: string | null;
  prNumber?: number | null;
  prUrl?: string | null;
  committedToGitHub?: boolean;
  merged?: boolean;
  statusState?: "draft" | "published";
  message?: string;
  updated_at?: string;
  error?: string;
}

export interface DeletePostResult {
  success: boolean;
  deletedFromGitHub: boolean;
  error?: string;
}

/**
 * Pure function: formats and serializes post attributes into standard YAML frontmatter + MDX body.
 *
 * Zero side-effects and no clock of its own: a serializer that reached for the current time
 * was a fourth place the present moment was read, in a module already handed one.
 */
export function serializePostMdx(data: PostMdxData): string {
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
  const { posts, locks, mirror, contents, clock } = services;

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
  const mdxContent = serializePostMdx({
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

  // 6. Guaranteed persistence: the editorial record is written before anything else
  await posts.save(record);

  // 7. Git Sync: Published Articles are authoritative on main, Drafts stay in D1
  const targetPath = `${BLOG_DIR}/${record.slug}/index.mdx`;
  const legacyBranch = `content/${cleanSlug}`;
  const gitResult = { committed: false, message: "" };

  if (isDraft) {
    if (existing?.status === "published" && contents) {
      const unpublish = await contents.deleteFile(targetPath, {
        message: `feat(blog): unpublish "${title}" (moved to draft)`,
      });
      void contents.deleteBranch(legacyBranch);
      gitResult.message = unpublish.success
        ? "Unpublished! Post moved back to draft in D1."
        : `Draft saved to D1, but unpublishing from GitHub failed: ${unpublish.error}`;
    } else {
      gitResult.message = "Draft saved successfully to D1.";
    }
  } else if (contents) {
    const commit = await contents.putFile(targetPath, mdxContent, {
      message: `feat(blog): publish "${title}" by @${author}`,
    });

    if (commit.success) {
      gitResult.committed = true;
      gitResult.message = "Published to main on GitHub & saved to D1.";
      void contents.deleteBranch(legacyBranch);
    } else {
      console.error("GitHub commit to main error:", commit.error);
      gitResult.message = `Saved to D1, but GitHub publish failed: ${commit.error}`;
    }
  } else {
    gitResult.message = "Saved to D1 as published (GitHub PAT not configured).";
  }

  // 8. Local development mirror, so the content collection sees the saved bundle
  await mirror.write(record.slug, mdxContent);

  // The store clears the legacy branch-and-PR columns as part of the save above.
  return {
    success: true,
    status: 200,
    id,
    slug: record.slug,
    gitBranch: null,
    prNumber: null,
    prUrl: null,
    statusState: status,
    committedToGitHub: gitResult.committed,
    message: gitResult.message,
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
  const { posts, mirror, contents } = services;

  if (!id) {
    return { success: false, deletedFromGitHub: false, error: "Missing post ID" };
  }

  const record = await posts.find(id);
  const slug = record?.slug?.trim().toLowerCase();

  // 1. Delete the editorial record
  await posts.remove(id);

  // 2. Synchronize deletion with the published bundle on main
  let deletedFromGitHub = false;
  if (contents && slug) {
    const bundle = await contents.deleteDirectory(`${BLOG_DIR}/${slug}`, {
      message: `feat(blog): delete "${slug}" bundle`,
    });
    if (!bundle.success) {
      console.warn("GitHub bundle deletion warning:", bundle.error);
    }

    // Legacy flat files from before Post Bundles existed
    const legacyMdx = await contents.deleteFile(`${BLOG_DIR}/${slug}.mdx`, {
      message: `feat(blog): delete post ${slug}.mdx`,
    });
    const legacyMd = await contents.deleteFile(`${BLOG_DIR}/${slug}.md`, {
      message: `feat(blog): delete post ${slug}.md`,
    });

    deletedFromGitHub = Boolean(bundle.deleted || legacyMdx.deleted || legacyMd.deleted);
  }

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

