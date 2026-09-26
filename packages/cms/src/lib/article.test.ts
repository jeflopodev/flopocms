import { describe, expect, it } from "vitest";
import {
  createArticleReadModel,
  diffArticleStores,
  isBundledHeroImage,
  toTemplateProps,
  type Article,
  type ArticleSource,
} from "./article";

function article(overrides: Partial<Article> & { slug: string }): Article {
  return {
    title: `Title ${overrides.slug}`,
    description: "",
    excerpt: "",
    author: "jeflopo",
    category: "General",
    tags: [],
    pubDate: "2026-01-01T00:00:00.000Z",
    template: "default",
    defaultWidth: "60rem",
    wideWidth: "70rem",
    status: "published",
    content: "<Paragraph>Body</Paragraph>",
    ...overrides,
  };
}

function sourceOf(articles: Article[]): ArticleSource {
  return {
    list: async () => articles,
    load: async (identifier) => articles.find((a) => a.slug === identifier) ?? null,
  };
}

describe("Article visibility", () => {
  const published = article({ slug: "published-one" });
  const draft = article({ slug: "draft-one", status: "draft" });

  it("hides drafts when drafts are not visible in this deployment", async () => {
    const articles = createArticleReadModel(sourceOf([published, draft]));
    expect(await articles.loadVisible("draft-one")).toBeNull();
    expect((await articles.listVisible()).map((a) => a.slug)).toEqual(["published-one"]);
  });

  it("shows drafts on a development or preview deployment", async () => {
    const articles = createArticleReadModel(sourceOf([published, draft]), { includeDrafts: true });
    expect((await articles.loadVisible("draft-one"))?.slug).toBe("draft-one");
    expect((await articles.listVisible()).map((a) => a.slug).sort()).toEqual(["draft-one", "published-one"]);
  });

  it("returns null for an Article that does not exist", async () => {
    const articles = createArticleReadModel(sourceOf([published]));
    expect(await articles.loadVisible("nope")).toBeNull();
  });

  it("lists newest first", async () => {
    const older = article({ slug: "older", pubDate: "2026-01-01T00:00:00.000Z" });
    const newer = article({ slug: "newer", pubDate: "2026-06-01T00:00:00.000Z" });
    const articles = createArticleReadModel(sourceOf([older, newer]));
    expect((await articles.listVisible()).map((a) => a.slug)).toEqual(["newer", "older"]);
  });
});

describe("Related Articles", () => {
  const current = article({ slug: "current", category: "Astro" });
  const sameCategory = article({ slug: "same", category: "Astro", pubDate: "2026-05-01T00:00:00.000Z" });
  const otherCategory = article({ slug: "other", category: "CSS" });
  const draft = article({ slug: "draft", category: "Astro", status: "draft" });

  it("never offers a Draft, even where drafts are otherwise visible", async () => {
    const articles = createArticleReadModel(sourceOf([current, sameCategory, draft]), { includeDrafts: true });
    const related = await articles.listRelated({ excludeSlug: "current" });
    expect(related.map((a) => a.slug)).toEqual(["same"]);
  });

  it("excludes the Article being read", async () => {
    const articles = createArticleReadModel(sourceOf([current, sameCategory, otherCategory]));
    const related = await articles.listRelated({ excludeSlug: "current" });
    expect(related.map((a) => a.slug)).not.toContain("current");
  });

  it("filters by category when one is given", async () => {
    const articles = createArticleReadModel(sourceOf([current, sameCategory, otherCategory]));
    expect((await articles.listRelated({ category: "CSS" })).map((a) => a.slug)).toEqual(["other"]);
  });

  it("returns every published Article when no category is given", async () => {
    const articles = createArticleReadModel(sourceOf([current, sameCategory, otherCategory]));
    const related = await articles.listRelated({ excludeSlug: "current" });
    expect(related.map((a) => a.slug).sort()).toEqual(["other", "same"]);
  });

  it("respects the limit", async () => {
    const articles = createArticleReadModel(sourceOf([sameCategory, otherCategory]));
    expect(await articles.listRelated({ limit: 1 })).toHaveLength(1);
  });
});

describe("toTemplateProps", () => {
  it("maps status to the draft flag and turns timestamps into dates", () => {
    const props = toTemplateProps(article({ slug: "a", status: "draft", pubDate: "2026-03-04T00:00:00.000Z" }));

    expect(props.draft).toBe(true);
    expect(props.pubDate).toBeInstanceOf(Date);
    expect(props.pubDate.toISOString()).toBe("2026-03-04T00:00:00.000Z");
    expect(props.updatedDate).toBeUndefined();
  });

  it("carries an updated date through when the Article has one", () => {
    const props = toTemplateProps(article({ slug: "a", updatedAt: "2026-04-05T00:00:00.000Z" }));
    expect(props.updatedDate?.toISOString()).toBe("2026-04-05T00:00:00.000Z");
  });
});

describe("projector invariant (diffArticleStores)", () => {
  it("reports a published D1 row whose bundle main does not have", () => {
    const divergences = diffArticleStores([], [article({ slug: "ghost" })]);
    expect(divergences).toEqual([
      {
        slug: "ghost",
        kind: "missing-from-main",
        detail: expect.stringContaining("main has no bundle"),
      },
    ]);
  });

  it("reports a bundle that the D1 projection does not know about", () => {
    const divergences = diffArticleStores([article({ slug: "orphan" })], []);
    expect(divergences).toEqual([
      { slug: "orphan", kind: "missing-from-d1", detail: expect.stringContaining("does not know about") },
    ]);
  });

  it("reports a content mismatch between the bundle and its projection", () => {
    const divergences = diffArticleStores(
      [article({ slug: "drifted", content: "<Paragraph>main</Paragraph>" })],
      [article({ slug: "drifted", content: "<Paragraph>d1</Paragraph>" })]
    );
    expect(divergences).toEqual([
      { slug: "drifted", kind: "content-differs", detail: expect.stringContaining("disagree on content") },
    ]);
  });

  it("treats a draft row with a published bundle as divergent", () => {
    const divergences = diffArticleStores(
      [article({ slug: "mixed", status: "published" })],
      [article({ slug: "mixed", status: "draft" })]
    );
    expect(divergences.map((d) => d.kind)).toEqual(["status-differs"]);
  });

  it("stays quiet when the two stores agree", () => {
    const agreed = article({ slug: "fine" });
    expect(diffArticleStores([agreed], [agreed])).toEqual([]);
  });

  it("does not report a Draft that main legitimately does not have", () => {
    expect(diffArticleStores([], [article({ slug: "work-in-progress", status: "draft" })])).toEqual([]);
  });
});

describe("Hero image", () => {
  it("tells a measured bundle asset from an editorial URL", () => {
    expect(
      isBundledHeroImage({ src: "/hero.webp", width: 1200, height: 630, format: "webp" })
    ).toBe(true);
    expect(isBundledHeroImage("/uploads/hero.webp")).toBe(false);
    expect(isBundledHeroImage(undefined)).toBe(false);
  });

  it("passes either shape through to a Post Template unchanged", () => {
    const bundled = { src: "/hero.webp", width: 1200, height: 630, format: "webp" as const };
    const withBundle = article({ slug: "bundled", heroImage: bundled });
    expect(toTemplateProps(withBundle).heroImage).toEqual(bundled);

    const withUrl = article({ slug: "url", heroImage: "/uploads/hero.webp" });
    expect(toTemplateProps(withUrl).heroImage).toBe("/uploads/hero.webp");
  });
});
