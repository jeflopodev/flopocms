import { describe, expect, it } from "vitest";
import {
  deletePostLifecycle,
  savePostLifecycle,
  serializePostMdx,
  type PostMdxData,
} from "./post-lifecycle";
import { articleWriteModel, type ArticleWriteModel } from "./article-write-model";
import { InMemoryGithubContents } from "./github-contents";
import { InMemoryLockStore } from "./locks";
import { InMemoryPostStore, type PostRecord } from "./post-store";
import { InMemoryMediaAdapter } from "./media-storage";
import { createNoopArticleMirror, type ArticleMirror } from "./article-mirror";
import type { Services } from "./services";
import type { DbClient } from "./db";

const NOW = "2026-09-21T12:00:00.000Z";
const BUNDLE = "src/content/blog/untitled-article/index.mdx";
const LEGACY_BRANCH = "content/untitled-article";
const LEGACY_FLAT_FILE = "src/content/blog/untitled-article.mdx";

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
      action: "delete",
      path: BUNDLE,
      message: 'feat(blog): unpublish "Untitled Article" (moved to draft)',
    });
    expect(contents.deletedBranches).toEqual([LEGACY_BRANCH]);
    expect(res.message).toBe("Unpublished! Post moved back to draft in D1.");
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
        action: "put",
        path: BUNDLE,
        message: 'feat(blog): publish "Untitled Article" by @jeflopo',
      },
    ]);
    expect(res).toMatchObject({
      committedToGitHub: true,
      statusState: "published",
      message: "Published to main on GitHub & saved to D1.",
    });
    expect(contents.deletedBranches).toEqual([LEGACY_BRANCH]);
    expect(posts.all()[0].status).toBe("published");
  });

  it("keeps the editorial record when the commit to main fails", async () => {
    const posts = new InMemoryPostStore();
    const contents = new InMemoryGithubContents();
    contents.failNextPut("403 Forbidden");

    const res = await savePostLifecycle({
      payload: payload({ status: "published" }),
      actor,
      services: testServices({ posts, contents }),
    });

    expect(res.success).toBe(true);
    expect(res.committedToGitHub).toBe(false);
    expect(res.message).toContain("Saved to D1, but GitHub publish failed: 403 Forbidden");
    expect(posts.all()[0]).toMatchObject({ status: "published" });
  });

  it("refuses to publish when no GitHub PAT is configured", async () => {
    const posts = new InMemoryPostStore();

    const res = await savePostLifecycle({
      payload: payload({ status: "published" }),
      actor,
      services: testServices({ posts, contents: null }),
    });

    expect(res).toMatchObject({
      committedToGitHub: false,
      message: "Saved to D1 as published (GitHub PAT not configured).",
    });
    expect(posts.all()[0].status).toBe("published");
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

  it("still deletes locally when main refuses the deletion", async () => {
    const posts = new InMemoryPostStore([storedRecord()]);
    const contents = new InMemoryGithubContents();
    contents.seedFile(BUNDLE, "bundle");
    contents.failNextDelete("500 Internal Server Error");

    const res = await deletePostLifecycle({ id: "post-1", services: testServices({ posts, contents }) });

    expect(res).toMatchObject({ success: true, deletedFromGitHub: false });
    expect(posts.all()).toEqual([]);
    expect(contents.has(BUNDLE)).toBe(true);
  });

  it("rejects a missing id", async () => {
    const res = await deletePostLifecycle({ id: "", services: testServices() });
    expect(res).toMatchObject({ success: false, error: "Missing post ID" });
  });
});

/**
 * `serializePostMdx` is the piece of Post Lifecycle that needs no dependencies at all.
 */
describe("serializePostMdx", () => {
  const PUB_DATE = "2026-09-21T12:00:00.000Z";
  const frontmatter = (markdown: string) => markdown.split("---")[1];
  /** The serializer has no clock of its own: every case names the moment it is writing for. */
  const serialize = (data: Partial<PostMdxData>) =>
    serializePostMdx({ title: "Hello", pubDate: PUB_DATE, ...data });

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
