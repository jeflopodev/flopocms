import { describe, expect, it } from "vitest";
import {
  createDraftPost,
  deletePostLifecycle,
  duplicatePostLifecycle,
  savePostLifecycle,
  serializePostBundle,
  type PostBundleData,
} from "./post-lifecycle";
import { articleWriteModel, type ArticleWriteModel } from "./article-write-model";
import { InMemoryGithubContents } from "./github-contents";
import { InMemoryLockStore } from "./locks";
import { InMemoryPostStore, type PostRecord } from "./post-store";
import { InMemoryMediaAdapter } from "./media-storage";
import { createNoopArticleMirror, type ArticleMirror } from "./article-mirror";
import type { AssetRegistry } from "./asset-registry";
import type { EditorAccounts } from "./editor-accounts";
import { InMemoryIdempotencyStore } from "./idempotency-store";
import { DEFAULT_CONTENT_DIR, DEFAULT_UPLOADS_DIR } from "./env";
import type { Services } from "./services";
import type { DbClient } from "./db";

const NOW = "2026-09-21T12:00:00.000Z";
const BUNDLE = `${DEFAULT_CONTENT_DIR}/untitled-article/index.mdx`;
const LEGACY_FLAT_FILE = `${DEFAULT_CONTENT_DIR}/untitled-article.mdx`;

const actor = { id: "user-1", username: "jeflopo" };

interface RecordingMirror {
  mirror: ArticleMirror;
  writes: { slug: string; mdx: string }[];
  removals: string[];
}

function recordingMirror(): RecordingMirror {
  const writes: { slug: string; mdx: string }[] = [];
  const removals: string[] = [];

  return {
    writes,
    removals,
    mirror: {
      write: async (slug, mdx) => {
        writes.push({ slug, mdx });
      },
      remove: async (slug) => {
        removals.push(slug);
      },
    },
  };
}

interface TestDeps {
  posts?: InMemoryPostStore;
  contents?: InMemoryGithubContents | null;
  locks?: InMemoryLockStore;
  mirror?: ArticleMirror;
  contentDir?: string;
  uploadsDir?: string;
}

/** A record store that refuses the projection write, as an unavailable D1 would. */
class UnwritablePostStore extends InMemoryPostStore {
  async save(_record: PostRecord): Promise<void> {
    throw new Error("D1 unavailable");
  }
}

/** Only the dependencies Post Lifecycle actually reaches are real here. */
function testServices(deps: TestDeps = {}): Services {
  return {
    // Post Lifecycle reads the editorial record through PostStore, never the database.
    db: undefined as unknown as DbClient,
    posts: deps.posts ?? new InMemoryPostStore(),
    locks: deps.locks ?? new InMemoryLockStore(),
    mirror: deps.mirror ?? createNoopArticleMirror(),
    contents: deps.contents !== undefined ? deps.contents : new InMemoryGithubContents(),
    media: new InMemoryMediaAdapter(),
    // None of these is reached from here; they are listed because the seam is typed as Services.
    assets: undefined as unknown as AssetRegistry,
    accounts: undefined as unknown as EditorAccounts,
    idempotency: new InMemoryIdempotencyStore(() => new Date(NOW)),
    contentDir: deps.contentDir ?? DEFAULT_CONTENT_DIR,
    uploadsDir: deps.uploadsDir ?? DEFAULT_UPLOADS_DIR,
    clock: { now: () => new Date(NOW) },
  };
}

/** Built through the write model, so the defaults under test are the ones in use. */
function payload(overrides: Partial<ArticleWriteModel> = {}): ArticleWriteModel {
  const parsed = articleWriteModel({
    id: "post-1",
    slug: "untitled-article",
    title: "Untitled Article",
    content_mdx: "<Paragraph>Body</Paragraph>",
    author: "jeflopo",
    ...overrides,
  });

  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.model;
}

function storedRecord(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    slug: "untitled-article",
    title: "Untitled Article",
    description: "",
    category: "General",
    tags: "[]",
    author: "jeflopo",
    featuredImage: "",
    contentMdx: "<Paragraph>Old</Paragraph>",
    status: "published",
    template: "default",
    defaultWidth: "60rem",
    wideWidth: "70rem",
    pubDate: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("saving a Draft", () => {
  it("writes the editorial record and leaves Git alone", async () => {
    const posts = new InMemoryPostStore();
    const contents = new InMemoryGithubContents();

    const res = await savePostLifecycle({ payload: payload(), actor, services: testServices({ posts, contents }) });

    expect(res).toMatchObject({
      success: true,
      status: 200,
      statusState: "draft",
      committedToGitHub: false,
      message: "Draft saved successfully to D1.",
    });
    expect(contents.commits).toEqual([]);
    expect(posts.all()).toHaveLength(1);
    expect(posts.all()[0]).toMatchObject({
      slug: "untitled-article",
      status: "draft",
      contentMdx: "<Paragraph>Body</Paragraph>",
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it("keeps the original creation date on an update", async () => {
    const posts = new InMemoryPostStore([storedRecord({ createdAt: "2026-01-01T00:00:00.000Z" })]);

    await savePostLifecycle({ payload: payload(), actor, services: testServices({ posts }) });

    expect(posts.all()[0].createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(posts.all()[0].updatedAt).toBe(NOW);
  });

  it("mirrors the bundle to disk for the local content collection", async () => {
    const recorded = recordingMirror();

    await savePostLifecycle({ payload: payload(), actor, services: testServices({ mirror: recorded.mirror }) });

    expect(recorded.writes).toHaveLength(1);
    expect(recorded.writes[0].slug).toBe("untitled-article");
    expect(recorded.writes[0].mdx).toContain("<Paragraph>Body</Paragraph>");
  });

  it("takes a published Article off main when it moves back to Draft", async () => {
    const posts = new InMemoryPostStore([storedRecord({ status: "published" })]);
    const contents = new InMemoryGithubContents();
    contents.seedFile(BUNDLE, "old bundle");

    const res = await savePostLifecycle({ payload: payload(), actor, services: testServices({ posts, contents }) });

    expect(contents.has(BUNDLE)).toBe(false);
    expect(contents.commits[0]).toMatchObject({
      action: "commit",
      path: BUNDLE,
      message: 'feat(blog): unpublish "Untitled Article" (moved to draft)',
    });
    expect(res.message).toBe("Unpublished! Post moved back to draft in D1.");
    expect(posts.all()[0].status).toBe("draft");
  });

  it("leaves a published Article published when main refuses the removal", async () => {
    const posts = new InMemoryPostStore([storedRecord({ status: "published" })]);
    const contents = new InMemoryGithubContents();
    contents.seedFile(BUNDLE, "published bundle");
    contents.failNextCommit("500 Internal Server Error");

    const res = await savePostLifecycle({
      payload: payload(),
      actor,
      services: testServices({ posts, contents }),
    });

    // Readers can still see it, so the record still says published.
    expect(res).toMatchObject({ success: false, status: 502 });
    expect(res.error).toContain("Nothing changed");
    expect(posts.all()[0].status).toBe("published");
    expect(contents.has(BUNDLE)).toBe(true);
  });

  it("refuses to unpublish when no GitHub PAT is configured", async () => {
    const posts = new InMemoryPostStore([storedRecord({ status: "published" })]);

    const res = await savePostLifecycle({
      payload: payload(),
      actor,
      services: testServices({ posts, contents: null }),
    });

    expect(res).toMatchObject({ success: false, status: 503 });
    expect(posts.all()[0].status).toBe("published");
  });
});

describe("publishing an Article", () => {
  it("commits the bundle to main and says so", async () => {
    const posts = new InMemoryPostStore();
    const contents = new InMemoryGithubContents();

    const res = await savePostLifecycle({
      payload: payload({ status: "published" }),
      actor,
      services: testServices({ posts, contents }),
    });

    expect(contents.commits).toEqual([
      {
        action: "commit",
        path: BUNDLE,
        message: 'feat(blog): publish "Untitled Article" by @jeflopo',
      },
    ]);
    expect(res).toMatchObject({
      committedToGitHub: true,
      projectedToD1: true,
      statusState: "published",
      message: "Published to main on GitHub & saved to D1.",
    });
    expect(posts.all()[0].status).toBe("published");
  });

  it("changes nothing when the commit to main fails", async () => {
    const posts = new InMemoryPostStore();
    const contents = new InMemoryGithubContents();
    contents.failNextCommit("403 Forbidden");

    const res = await savePostLifecycle({
      payload: payload({ status: "published" }),
      actor,
      services: testServices({ posts, contents }),
    });

    // No reader can see this Article, so no record may claim they can.
    expect(res).toMatchObject({ success: false, status: 502 });
    expect(res.error).toContain("Nothing was published");
    expect(posts.all()).toEqual([]);
    expect(contents.has(BUNDLE)).toBe(false);
  });

  it("refuses to publish when no GitHub PAT is configured", async () => {
    const posts = new InMemoryPostStore();

    const res = await savePostLifecycle({
      payload: payload({ status: "published" }),
      actor,
      services: testServices({ posts, contents: null }),
    });

    expect(res).toMatchObject({ success: false, status: 503 });
    expect(res.error).toContain("no GitHub PAT");
    expect(posts.all()).toEqual([]);
  });

  it("reports a stale record when main took the bundle but the projection failed", async () => {
    const contents = new InMemoryGithubContents();

    const res = await savePostLifecycle({
      payload: payload({ status: "published" }),
      actor,
      services: testServices({ posts: new UnwritablePostStore(), contents }),
    });

    // The Article is live and the record is behind it, which is the failure worth having.
    expect(res).toMatchObject({
      success: true,
      committedToGitHub: true,
      projectedToD1: false,
    });
    expect(res.message).toContain("stale");
    expect(contents.has(BUNDLE)).toBe(true);
  });

  it("refuses a publish based on a stale bundle sha", async () => {
    const posts = new InMemoryPostStore();
    const contents = new InMemoryGithubContents();
    contents.seedFile(BUNDLE, "current bundle");

    const res = await savePostLifecycle({
      payload: payload({ status: "published", expected_sha: "sha-stale" }),
      actor,
      services: testServices({ posts, contents }),
    });

    expect(res).toMatchObject({ success: false, status: 409 });
    expect(res.error).toContain("moved on main");
    expect(posts.all()).toEqual([]);
  });

  it("refuses to publish a bundle whose upload is absent on main", async () => {
    const posts = new InMemoryPostStore();
    const contents = new InMemoryGithubContents();

    const res = await savePostLifecycle({
      payload: payload({
        status: "published",
        content_mdx: '<Image src="/uploads/hero.webp" alt="hero" />',
      }),
      actor,
      services: testServices({ posts, contents }),
    });

    expect(res).toMatchObject({ success: false, status: 422 });
    expect(res.error).toContain('"/uploads/hero.webp"');
    expect(posts.all()).toEqual([]);
    expect(contents.commits).toEqual([]);
  });

  it("publishes when every referenced upload is on main", async () => {
    const posts = new InMemoryPostStore();
    const contents = new InMemoryGithubContents();
    contents.seedFile(`${DEFAULT_UPLOADS_DIR}/hero.webp`, "bytes");

    const res = await savePostLifecycle({
      payload: payload({
        status: "published",
        content_mdx: '<Image src="/uploads/hero.webp" alt="hero" />',
      }),
      actor,
      services: testServices({ posts, contents }),
    });

    expect(res).toMatchObject({ success: true, committedToGitHub: true });
    expect(posts.all()[0].status).toBe("published");
  });

  it("refuses to publish when the featured image was deleted from main", async () => {
    const posts = new InMemoryPostStore();
    const contents = new InMemoryGithubContents();

    const res = await savePostLifecycle({
      payload: payload({ status: "published", featured_image: "/uploads/gone.webp" }),
      actor,
      services: testServices({ posts, contents }),
    });

    expect(res).toMatchObject({ success: false, status: 422 });
    expect(res.error).toContain('"/uploads/gone.webp"');
    expect(contents.commits).toEqual([]);
  });

  it("refuses a publish based on a stale ref", async () => {
    const posts = new InMemoryPostStore();
    const contents = new InMemoryGithubContents();
    const staleRef = contents.currentRef();
    await contents.putFile("other.txt", "other", { message: "other" });

    const res = await savePostLifecycle({
      payload: payload({ status: "published", expected_ref: staleRef }),
      actor,
      services: testServices({ posts, contents }),
    });

    expect(res).toMatchObject({ success: false, status: 409 });
    expect(posts.all()).toEqual([]);
  });
});

describe("refusals", () => {
  it("changes nothing when another Editor holds the Concurrency Lock", async () => {
    const posts = new InMemoryPostStore();
    const contents = new InMemoryGithubContents();
    const locks = new InMemoryLockStore();
    await locks.acquire("post-1", { id: "user-2", username: "aflopo" });

    const res = await savePostLifecycle({
      payload: payload(),
      actor,
      services: testServices({ posts, contents, locks }),
    });

    expect(res).toMatchObject({ success: false, status: 423, lockedBy: "aflopo" });
    expect(res.error).toContain("@aflopo");
    expect(posts.all()).toEqual([]);
    expect(contents.commits).toEqual([]);
  });

  it("lets the Editor holding the lock save", async () => {
    const locks = new InMemoryLockStore();
    await locks.acquire("post-1", { id: actor.id, username: actor.username });

    const res = await savePostLifecycle({ payload: payload(), actor, services: testServices({ locks }) });

    expect(res.success).toBe(true);
  });

  it("rejects a slug another Article already uses", async () => {
    const posts = new InMemoryPostStore([
      storedRecord(),
      storedRecord({ id: "post-2", slug: "taken-slug", title: "Someone else" }),
    ]);
    const contents = new InMemoryGithubContents();

    const res = await savePostLifecycle({
      payload: payload({ slug: "taken-slug" }),
      actor,
      services: testServices({ posts, contents }),
    });

    expect(res).toMatchObject({ success: false, status: 409 });
    expect(res.error).toContain("already used");
    expect(contents.commits).toEqual([]);
    expect(posts.all()).toHaveLength(2);
  });

  it("rejects a slug that is not lowercase alphanumeric with hyphens", async () => {
    const posts = new InMemoryPostStore();

    const res = await savePostLifecycle({
      payload: payload({ slug: "Not A Slug!" }),
      actor,
      services: testServices({ posts }),
    });

    expect(res).toMatchObject({ success: false, status: 400 });
    expect(posts.all()).toEqual([]);
  });

  it("requires an id, slug and title", async () => {
    // Spreading the built payload past the write model's own schema, because this is Post
    // Lifecycle's invariant rather than the transport's.
    const res = await savePostLifecycle({
      payload: { ...payload(), title: "" },
      actor,
      services: testServices(),
    });
    expect(res).toMatchObject({ success: false, status: 400 });
  });
});

describe("a body the Document Parser cannot fully resolve", () => {
  const UNRENDERABLE = `<Ul list-style-type="disc">\n  <ListItem>One</ListItem>\n</Ul>`;
  // <Image> without a src renders from the Block's defaults: half-typed, not broken.
  const SUSPECT = `<Image alt="No source" />`;

  it("refuses a Draft whose body has a block nothing can render", async () => {
    const posts = new InMemoryPostStore();

    const res = await savePostLifecycle({
      payload: payload({ content_mdx: UNRENDERABLE }),
      actor,
      services: testServices({ posts }),
    });

    expect(res).toMatchObject({ success: false, status: 422 });
    expect(res.error).toContain("<Ul>");
    expect(res.problems).toHaveLength(1);
    expect(posts.all()).toEqual([]);
  });

  it("lets a Draft through on props that fell back to defaults, and says so", async () => {
    const posts = new InMemoryPostStore();

    const res = await savePostLifecycle({
      payload: payload({ content_mdx: SUSPECT }),
      actor,
      services: testServices({ posts }),
    });

    expect(res).toMatchObject({ success: true, status: 200 });
    expect(res.problems?.[0]).toMatchObject({ severity: "suspect", code: "invalid-props" });
    expect(posts.all()).toHaveLength(1);
  });

  it("refuses to publish those same props, before anything is written", async () => {
    const posts = new InMemoryPostStore();
    const contents = new InMemoryGithubContents();

    const res = await savePostLifecycle({
      payload: payload({ status: "published", content_mdx: SUSPECT }),
      actor,
      services: testServices({ posts, contents }),
    });

    expect(res).toMatchObject({ success: false, status: 422 });
    expect(res.error).toContain("Cannot publish");
    expect(contents.commits).toEqual([]);
    expect(posts.all()).toEqual([]);
  });

  it("reports nothing for a body it can resolve completely", async () => {
    const res = await savePostLifecycle({ payload: payload(), actor, services: testServices() });

    expect(res.problems).toEqual([]);
  });
});

describe("deleting an Article", () => {
  it("removes the editorial record and the bundle from main", async () => {
    const posts = new InMemoryPostStore([storedRecord()]);
    const contents = new InMemoryGithubContents();
    contents.seedFile(BUNDLE, "bundle");
    contents.seedFile(LEGACY_FLAT_FILE, "legacy");
    const recorded = recordingMirror();

    const res = await deletePostLifecycle({
      id: "post-1",
      services: testServices({ posts, contents, mirror: recorded.mirror }),
    });

    expect(res).toMatchObject({ success: true, deletedFromGitHub: true });
    expect(posts.all()).toEqual([]);
    expect(contents.has(BUNDLE)).toBe(false);
    expect(contents.has(LEGACY_FLAT_FILE)).toBe(false);
    expect(recorded.removals).toEqual(["untitled-article"]);
  });

  it("reports that main had nothing to remove", async () => {
    const posts = new InMemoryPostStore([storedRecord()]);

    const res = await deletePostLifecycle({ id: "post-1", services: testServices({ posts }) });

    expect(res).toMatchObject({ success: true, deletedFromGitHub: false });
    expect(posts.all()).toEqual([]);
  });

  it("changes nothing when main refuses the deletion", async () => {
    const posts = new InMemoryPostStore([storedRecord()]);
    const contents = new InMemoryGithubContents();
    contents.seedFile(BUNDLE, "bundle");
    contents.failNextCommit("500 Internal Server Error");

    const res = await deletePostLifecycle({ id: "post-1", services: testServices({ posts, contents }) });

    // Readers can still see it, so the record that says so stays.
    expect(res).toMatchObject({ success: false, status: 502 });
    expect(res.error).toContain("Nothing was deleted");
    expect(posts.all()).toHaveLength(1);
    expect(contents.has(BUNDLE)).toBe(true);
  });

  it("refuses to delete a published Article with no GitHub PAT", async () => {
    const posts = new InMemoryPostStore([storedRecord()]);

    const res = await deletePostLifecycle({
      id: "post-1",
      services: testServices({ posts, contents: null }),
    });

    expect(res).toMatchObject({ success: false, status: 503 });
    expect(posts.all()).toHaveLength(1);
  });

  it("deletes a Draft with no GitHub PAT, because main has no bundle of it", async () => {
    const posts = new InMemoryPostStore([storedRecord({ status: "draft" })]);

    const res = await deletePostLifecycle({
      id: "post-1",
      services: testServices({ posts, contents: null }),
    });

    expect(res).toMatchObject({ success: true, deletedFromGitHub: false });
    expect(posts.all()).toEqual([]);
  });

  it("rejects a missing id", async () => {
    const res = await deletePostLifecycle({ id: "", services: testServices() });
    expect(res).toMatchObject({ success: false, error: "Missing post ID" });
  });
});

/**
 * `serializePostBundle` is the piece of Post Lifecycle that needs no dependencies at all.
 */
describe("serializePostBundle", () => {
  const PUB_DATE = "2026-09-21T12:00:00.000Z";
  const frontmatter = (markdown: string) => markdown.split("---")[1];
  /** The serializer has no clock of its own: every case names the moment it is writing for. */
  const serialize = (data: Partial<PostBundleData>) =>
    serializePostBundle({ title: "Hello", pubDate: PUB_DATE, ...data });

  it("writes the published status into frontmatter", () => {
    const mdx = serialize({ draft: false });
    expect(frontmatter(mdx)).toContain("draft: false");
    expect(frontmatter(mdx)).toContain("title: 'Hello'");
  });

  it("defaults to a draft", () => {
    expect(frontmatter(serialize({}))).toContain("draft: true");
  });

  it("keeps only the date part of a publication timestamp", () => {
    expect(frontmatter(serialize({ pubDate: "2026-09-21T12:00:00.000Z" }))).toContain("pubDate: '2026-09-21'");
  });

  it("escapes single quotes so frontmatter stays parseable", () => {
    const mdx = serialize({ title: "It's here", description: "Don't break" });
    expect(frontmatter(mdx)).toContain("title: 'It''s here'");
    expect(frontmatter(mdx)).toContain("description: 'Don''t break'");
  });

  it("flattens newlines out of the title", () => {
    expect(frontmatter(serialize({ title: "Two\nlines" }))).toContain("title: 'Two lines'");
  });

  it("omits an empty hero image rather than writing a blank field", () => {
    expect(frontmatter(serialize({}))).not.toContain("heroImage");
    expect(frontmatter(serialize({ heroImage: "/uploads/a.webp" }))).toContain(
      "heroImage: '/uploads/a.webp'"
    );
  });

  it("carries the JSX Block DSL body through untouched", () => {
    expect(serialize({ contentMdx: "<Paragraph>Body</Paragraph>" })).toContain(
      "<Paragraph>Body</Paragraph>"
    );
  });
});

describe("createDraftPost", () => {
  it("creates a new draft post with unique id and slug", async () => {
    const posts = new InMemoryPostStore();
    const services = testServices({ posts });

    const result = await createDraftPost({ actor: { username: "aflopo" }, services });

    expect(result.success).toBe(true);
    expect(result.id).toBeDefined();
    expect(result.slug).toMatch(/^untitled-[a-z0-9]+$/);

    const saved = await posts.find(result.id!);
    expect(saved).toBeDefined();
    expect(saved?.author).toBe("aflopo");
    expect(saved?.status).toBe("draft");
    expect(saved?.title).toBe("Untitled Article");
    expect(saved?.template).toBe("default");
    expect(saved?.defaultWidth).toBe("60rem");
    expect(saved?.wideWidth).toBe("70rem");
    expect(saved?.createdAt).toBe(NOW);
    expect(saved?.updatedAt).toBe(NOW);
  });

  it("falls back to default author when none provided", async () => {
    const posts = new InMemoryPostStore();
    const services = testServices({ posts });

    const result = await createDraftPost({ actor: {}, services });

    expect(result.success).toBe(true);
    const saved = await posts.find(result.id!);
    expect(saved?.author).toBe("jeflopo");
  });
});

describe("duplicatePostLifecycle", () => {
  it("duplicates an existing post as a draft with (Copy) title and new unique slug", async () => {
    const seed: PostRecord = {
      id: "orig-1",
      slug: "awesome-post",
      title: "Awesome Post",
      description: "Original description",
      category: "Tech",
      tags: '["astro"]',
      author: "jeflopo",
      featuredImage: "/uploads/hero.jpg",
      contentMdx: "<Paragraph>Hello world</Paragraph>",
      status: "published",
      template: "two-column",
      defaultWidth: "50rem",
      wideWidth: "65rem",
      pubDate: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const posts = new InMemoryPostStore([seed]);
    const services = testServices({ posts });

    const result = await duplicatePostLifecycle({ id: "orig-1", services });

    expect(result.success).toBe(true);
    expect(result.newId).toBeDefined();
    expect(result.newId).not.toBe("orig-1");

    const copy = await posts.find(result.newId!);
    expect(copy).toBeDefined();
    expect(copy?.title).toBe("Awesome Post (Copy)");
    expect(copy?.slug).toMatch(/^awesome-post-copy-[a-z0-9]+$/);
    expect(copy?.status).toBe("draft");
    expect(copy?.template).toBe("two-column");
    expect(copy?.contentMdx).toBe("<Paragraph>Hello world</Paragraph>");
    expect(copy?.createdAt).toBe(NOW);
    expect(copy?.updatedAt).toBe(NOW);
  });

  it("returns error when post is not found", async () => {
    const posts = new InMemoryPostStore();
    const services = testServices({ posts });

    const result = await duplicatePostLifecycle({ id: "non-existent", services });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Post not found");
  });

  it("returns error when id is missing", async () => {
    const posts = new InMemoryPostStore();
    const services = testServices({ posts });

    const result = await duplicatePostLifecycle({ id: "", services });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Missing post ID");
  });
});

