import { getCollection, type CollectionEntry } from "astro:content";
import type { ImageMetadata } from "astro";
import type { Article, ArticleSource, BundledHeroImage, HeroImage, TemplateId } from "../article";

/**
 * The Git bundle source: reads Post Bundles from `<site>/src/content/blog/<slug>/index.mdx`
 * through the Astro content collection, which already yields parsed metadata and the
 * raw body. Only usable inside an Astro build, which is where production pages run.
 *
 * The bundle frontmatter carries no category or tags — those belong to the editorial
 * record in D1 — so Articles from this source report the General defaults.
 */
/**
 * Narrows an imported image to what an Article carries.
 *
 * The body is a compile-time assertion: this only typechecks while Astro's
 * `ImageMetadata` is still structurally a `BundledHeroImage`, which is what lets a Post
 * Template hand the value straight to `<Image>`. If Astro's shape moves, this fails the
 * build instead of silently dropping the measurements the optimizer needs.
 */
export function bundledHeroImage(metadata: ImageMetadata): BundledHeroImage {
  return metadata;
}

function toHeroImage(value: CollectionEntry<"blog">["data"]["heroImage"]): HeroImage | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "src" in value && value.src) {
    return bundledHeroImage(value as ImageMetadata);
  }
  return undefined;
}

export function entryToArticle(entry: CollectionEntry<"blog">): Article {
  const { data } = entry;

  return {
    slug: entry.id,
    title: data.title,
    description: data.description || "",
    excerpt: (data as { excerpt?: string }).excerpt || "",
    author: data.author,
    category: "General",
    tags: [],
    pubDate: data.pubDate.toISOString(),
    updatedAt: data.updatedDate ? new Date(data.updatedDate).toISOString() : undefined,
    heroImage: toHeroImage(data.heroImage),
    template: (data.template || "default") as TemplateId,
    defaultWidth: data.defaultWidth || "60rem",
    wideWidth: data.wideWidth || "70rem",
    status: data.draft ? "draft" : "published",
    content: entry.body ?? "",
  };
}

export function createGitBundleSource(): ArticleSource {
  let pending: Promise<Article[]> | null = null;

  const all = () => (pending ??= getCollection("blog").then((entries) => entries.map(entryToArticle)));

  return {
    list: () => all(),

    async load(identifier) {
      if (!identifier) return null;
      const articles = await all();
      return articles.find((article) => article.slug === identifier) ?? null;
    },
  };
}
