import { eq, or } from "drizzle-orm";
import type { DbClient } from "#/lib/db";
import { posts as postsTable } from "#/lib/db";
import type { Article, ArticleSource, TemplateId } from "#/lib/article";

export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [raw];
  }
}

/**
 * Maps an editorial record to the Article shape. The `posts` table is D1's view of an
 * Article: authoritative for Drafts, a projection of `main` for published content.
 */
export function rowToArticle(row: any): Article {
  return {
    slug: row.slug,
    title: row.title || "",
    description: row.description || "",
    excerpt: row.excerpt || "",
    author: row.author || "jeflopo",
    category: row.category || "General",
    tags: parseTags(row.tags),
    pubDate: row.pubDate || row.createdAt,
    updatedAt: row.updatedAt,
    heroImage: row.featuredImage || undefined,
    template: (row.template || "default") as TemplateId,
    defaultWidth: row.defaultWidth || "60rem",
    wideWidth: row.wideWidth || "70rem",
    status: row.status === "published" ? "published" : "draft",
    content: row.contentMdx || "",
  };
}

export function createD1ArticleSource(db: DbClient): ArticleSource {
  return {
    async list() {
      const rows = await db.select().from(postsTable);
      return rows.map(rowToArticle);
    },

    async load(identifier) {
      if (!identifier) return null;
      const [row] = await db
        .select()
        .from(postsTable)
        .where(or(eq(postsTable.id, identifier), eq(postsTable.slug, identifier)))
        .limit(1);
      return row ? rowToArticle(row) : null;
    },
  };
}
