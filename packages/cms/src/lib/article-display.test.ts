import { describe, expect, it } from "vitest";
import { articleDisplayPlan } from "./article-display";
import { renderDocument } from "blocks/dsl/renderer";
import type { Article, ArticleReadModel } from "./article";

const BODY = `<Heading level={2}>A heading</Heading>\n<Paragraph>Body text</Paragraph>`;

/** Blocks that read other Articles get an empty answer; the parity claim is about the rest. */
const articles: ArticleReadModel = {
  loadVisible: async () => null,
  listVisible: async () => [],
  listRelated: async () => [],
};

function article(overrides: Partial<Article> = {}): Article {
  return {
    slug: "untitled-article",
    title: "Untitled Article",
    description: "A description",
    author: "jeflopo",
    category: "Astro",
    tags: ["astro"],
    pubDate: "2026-09-20T12:00:00.000Z",
    template: "default",
    defaultWidth: "60rem",
    wideWidth: "70rem",
    status: "published",
    content: BODY,
    ...overrides,
  };
}

const planFor = (mode: "published" | "preview", overrides: Partial<Article> = {}) =>
  articleDisplayPlan(article(overrides), mode, articles);

describe("the Article Display plan", () => {
  it("gives a reader and a preview the same block context", () => {
    const published = planFor("published");
    const preview = planFor("preview");

    expect(published.blockContext.post).toEqual(preview.blockContext.post);
    expect(published.blockContext.post).toEqual({
      id: "untitled-article",
      slug: "untitled-article",
      title: "Untitled Article",
      author: "jeflopo",
      category: "Astro",
    });
  });

  it("renders the same Article identically in both modes", async () => {
    const published = await renderDocument(BODY, planFor("published").blockContext);
    const preview = await renderDocument(BODY, planFor("preview").blockContext);

    // Not `blocks`: the parser mints a fresh id per parse, so two parses of one document are
    // not comparable node-for-node. What a reader sees is.
    expect(preview.html).toBe(published.html);
    expect(preview.jsonLd).toEqual(published.jsonLd);
    expect(preview.styles).toBe(published.styles);
  });

  it("only tells the two modes apart by what is the surface's own", () => {
    const published = planFor("published");
    const preview = planFor("preview");

    expect(published.blockContext.isDraftPreview).toBe(false);
    expect(preview.blockContext.isDraftPreview).toBe(true);
    expect(published.title).toBe("Untitled Article");
    expect(preview.title).toBe("[Preview] Untitled Article");
  });

  it("shows the Draft banner in a preview even of a published Article", () => {
    expect(planFor("published").templateProps.draft).toBe(false);
    expect(planFor("preview").templateProps.draft).toBe(true);
    expect(planFor("published", { status: "draft" }).templateProps.draft).toBe(true);
  });

  it("carries the Article's template and metadata into the props", () => {
    const plan = planFor("published", { template: "two-column", wideWidth: "74rem" });

    expect(plan.template).toBe("two-column");
    expect(plan.templateProps).toMatchObject({
      title: "Untitled Article",
      description: "A description",
      author: "jeflopo",
      wideWidth: "74rem",
    });
    expect(plan.templateProps.pubDate).toBeInstanceOf(Date);
  });
});
