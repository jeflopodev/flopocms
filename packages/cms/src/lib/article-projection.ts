import { isBundledHeroImage, type Article } from "./article";
import type { PostRecord } from "./post-store";

/**
 * Article Projection.
 *
 * The one mapping from an Article `main` holds to the editorial record that projects it.
 * A re-projection writes what a save would have written, rather than a second spelling of
 * the same row drifting from the first.
 */

export interface ProjectionOptions {
  /** The record's identity. Minted only when main has an Article the record never held. */
  id?: string;
  /** Used for the timestamps an Article does not carry. */
  now: Date;
}

export function projectArticle(article: Article, options: ProjectionOptions): PostRecord {
  // A bundle's hero image is an optimized asset the build measured; the record holds a URL.
  const featuredImage = isBundledHeroImage(article.heroImage)
    ? article.heroImage.src
    : article.heroImage || "";

  return {
    id: options.id ?? crypto.randomUUID(),
    slug: article.slug,
    title: article.title,
    description: article.description,
    category: article.category,
    tags: JSON.stringify(article.tags ?? []),
    author: article.author,
    featuredImage,
    contentMdx: article.content,
    status: article.status,
    template: article.template,
    defaultWidth: article.defaultWidth,
    wideWidth: article.wideWidth,
    pubDate: article.pubDate,
    createdAt: article.pubDate,
    updatedAt: article.updatedAt ?? article.pubDate,
  };
}
