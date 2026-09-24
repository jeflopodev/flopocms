import { describe, expect, it } from "vitest";
import { articleWriteModel, toPostRecord, type ArticleWriteModel } from "./article-write-model";
import type { PostRecord } from "./post-store";

const NOW = "2026-09-21T12:00:00.000Z";

function model(overrides: Record<string, unknown> = {}): ArticleWriteModel {
  const parsed = articleWriteModel({
    id: "post-1",
    slug: "untitled-article",
    title: "Untitled Article",
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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: NOW,
    ...overrides,
  };
}

describe("parsing an incoming Article", () => {
  it("fills in every field the Editor may leave out", () => {
    expect(model()).toEqual({
      id: "post-1",
      slug: "untitled-article",
      title: "Untitled Article",
      description: "",
      category: "General",
      tags: [],
      featured_image: "",
      content_mdx: "",
      status: "draft",
      template: "default",
      default_width: "60rem",
      wide_width: "70rem",
    });
  });

  it("names the field that is the wrong shape", () => {
    const parsed = articleWriteModel({
      id: "post-1",
      slug: "untitled-article",
      title: "Untitled Article",
      tags: "a,b",
    });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain("tags");
  });

  it("refuses an Article with no title", () => {
    const parsed = articleWriteModel({ id: "post-1", slug: "untitled-article", title: "" });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain("title");
  });

  it("refuses a status or template outside the stored set", () => {
    expect(articleWriteModel({ id: "p", slug: "s", title: "t", status: "Published" }).ok).toBe(false);
    expect(articleWriteModel({ id: "p", slug: "s", title: "t", template: "three-column" }).ok).toBe(false);
  });
});

describe("mapping a write model to the editorial record", () => {
  it("keeps every editable field, so a field cannot silently disappear", () => {
    const record = toPostRecord(
      model({
        description: "A description",
        category: "Engineering",
        tags: ["astro", "d1"],
        author: "aflopo",
        featured_image: "/uploads/hero.png",
        content_mdx: "<Paragraph>Body</Paragraph>",
        status: "published",
        template: "two-column",
        default_width: "70rem",
        wide_width: "80rem",
        pub_date: "2026-03-04T12:00:00.000Z",
      }),
      { now: NOW, author: "aflopo" }
    );

    expect(record).toMatchObject({
      description: "A description",
      category: "Engineering",
      tags: '["astro","d1"]',
      author: "aflopo",
      featuredImage: "/uploads/hero.png",
      contentMdx: "<Paragraph>Body</Paragraph>",
      status: "published",
      template: "two-column",
      defaultWidth: "70rem",
      wideWidth: "80rem",
      pubDate: "2026-03-04T12:00:00.000Z",
    });
  });

  it("normalises the slug the way Post Lifecycle validates it", () => {
    const record = toPostRecord(model({ slug: "  Untitled-Article  " }), { now: NOW, author: "jeflopo" });

    expect(record.slug).toBe("untitled-article");
  });

  it("keeps the creation date and stamps the save time", () => {
    const record = toPostRecord(model(), { existing: storedRecord(), now: NOW, author: "jeflopo" });

    expect(record.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(record.updatedAt).toBe(NOW);
  });

  it("publishes with the save time when the Article has no publication date", () => {
    const record = toPostRecord(model(), { now: NOW, author: "jeflopo" });

    expect(record.pubDate).toBe(NOW);
    expect(record.createdAt).toBe(NOW);
  });

  it("takes the author from the resolved Actor when the write model has none", () => {
    const record = toPostRecord(model(), { now: NOW, author: "aflopo" });

    expect(record.author).toBe("aflopo");
  });
});
