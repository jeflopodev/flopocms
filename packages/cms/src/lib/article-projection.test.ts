import { describe, expect, it } from "vitest";
import { projectArticle } from "./article-projection";
import type { Article } from "./article";

const NOW = new Date("2026-09-22T09:00:00.000Z");

function article(overrides: Partial<Article> = {}): Article {
  return {
    slug: "untitled-article",
    title: "Untitled Article",
    description: "A description",
    author: "jeflopo",
    category: "General",
    tags: ["astro", "css"],
    pubDate: "2026-09-20T12:00:00.000Z",
    template: "two-column",
    defaultWidth: "62rem",
    wideWidth: "74rem",
    status: "published",
    content: "<Paragraph>Body</Paragraph>",
    ...overrides,
  };
}

describe("projecting an Article into the editorial record", () => {
  it("carries the body, the metadata and the status", () => {
    const record = projectArticle(article(), { id: "post-1", now: NOW });

    expect(record).toMatchObject({
      id: "post-1",
      slug: "untitled-article",
      title: "Untitled Article",
      description: "A description",
      category: "General",
      author: "jeflopo",
      contentMdx: "<Paragraph>Body</Paragraph>",
      status: "published",
      template: "two-column",
      defaultWidth: "62rem",
      wideWidth: "74rem",
      pubDate: "2026-09-20T12:00:00.000Z",
    });
  });

  it("stores tags the way the record reads them", () => {
    const record = projectArticle(article(), { id: "post-1", now: NOW });

    expect(JSON.parse(record.tags)).toEqual(["astro", "css"]);
  });

  it("takes a bundled hero image's source and leaves an editorial URL alone", () => {
    const bundled = projectArticle(
      article({ heroImage: { src: "/_astro/hero.webp", width: 1200, height: 630, format: "webp" } }),
      { id: "post-1", now: NOW }
    );
    const editorial = projectArticle(article({ heroImage: "/uploads/hero.webp" }), {
      id: "post-1",
      now: NOW,
    });

    expect(bundled.featuredImage).toBe("/_astro/hero.webp");
    expect(editorial.featuredImage).toBe("/uploads/hero.webp");
  });

  it("falls back to the publication date for the timestamps main does not record", () => {
    const withoutUpdate = projectArticle(article(), { id: "post-1", now: NOW });
    const updated = projectArticle(article({ updatedAt: "2026-09-21T08:00:00.000Z" }), {
      id: "post-1",
      now: NOW
    });

    expect(withoutUpdate).toMatchObject({
      createdAt: "2026-09-20T12:00:00.000Z",
      updatedAt: "2026-09-20T12:00:00.000Z",
    });
    expect(updated.updatedAt).toBe("2026-09-21T08:00:00.000Z");
  });

  it("mints an identity only when the caller has none", () => {
    const minted = projectArticle(article(), { now: NOW });

    expect(minted.id).toBeTruthy();
    expect(minted.id).not.toBe(projectArticle(article(), { now: NOW }).id);
  });
});
