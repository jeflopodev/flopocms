import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { TemplateId } from "./article";
import type { DbClient } from "./db";
import { posts as postsTable } from "./db";

export type PostStatus = "draft" | "published";

/**
 * The editorial record of an Article, as Post Lifecycle reads and writes it.
 *
 * This is deliberately narrower than the Article shape: it holds what must be *stored*
 * (the body as DSL text, tags as a JSON string), not what a reader needs.
 */
export interface PostRecord {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string;
  author: string;
  featuredImage: string;
  contentMdx: string;
  status: PostStatus;
  /** Matches the D1 column's enum, so the adapter needs no cast. */
  template: TemplateId;
  defaultWidth: string;
  wideWidth: string;
  pubDate: string;
  createdAt: string;
  updatedAt: string;
}

/** How many Articles an Editor has, by status. The Profile & Security page's figures. */
export interface AuthorCounts {
  total: number;
  published: number;
  drafts: number;
}

/**
 * D1's editorial record seam.
 *
 * Post Lifecycle needs five things from the editorial store, not a query builder, which
 * is what lets its draft/publish/unpublish transitions run against a substitute.
 */
export interface PostStore {
  find(id: string): Promise<PostRecord | null>;
  /** The record for a slug, which is how a projection from main finds what it repairs. */
  findBySlug(slug: string): Promise<PostRecord | null>;
  /** The editorial listing for the Admin Dashboard, most recently edited first. */
  list(): Promise<PostRecord[]>;
  /** Is this slug already used by a different Article? */
  slugTaken(slug: string, exceptId: string): Promise<boolean>;
  /** Writes the whole record: the editorial record is a projection of what main holds. */
  save(record: PostRecord): Promise<void>;
  remove(id: string): Promise<void>;
  /** What one Editor has written, so a profile needs no query of its own. */
  countsByAuthor(author: string): Promise<AuthorCounts>;
}

export function createD1PostStore(db: DbClient): PostStore {
  const columnsFor = (record: PostRecord) => ({
    slug: record.slug,
    title: record.title,
    description: record.description,
    category: record.category,
    tags: record.tags,
    author: record.author,
    featuredImage: record.featuredImage,
    contentMdx: record.contentMdx,
    status: record.status,
    template: record.template,
    defaultWidth: record.defaultWidth,
    wideWidth: record.wideWidth,
    pubDate: record.pubDate,
    updatedAt: record.updatedAt,
  });

  return {
    async find(id) {
      const [row] = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1);
      return row ?? null;
    },

    async findBySlug(slug) {
      const [row] = await db
        .select()
        .from(postsTable)
        .where(eq(postsTable.slug, slug))
        .limit(1);
      return row ?? null;
    },

    async list() {
      return db.select().from(postsTable).orderBy(desc(postsTable.updatedAt));
    },

    async slugTaken(slug, exceptId) {
      const [row] = await db
        .select({ id: postsTable.id })
        .from(postsTable)
        .where(and(eq(postsTable.slug, slug), ne(postsTable.id, exceptId)))
        .limit(1);
      return Boolean(row);
    },

    async save(record) {
      const [existing] = await db
        .select({ id: postsTable.id })
        .from(postsTable)
        .where(eq(postsTable.id, record.id))
        .limit(1);

      if (existing) {
        await db.update(postsTable).set(columnsFor(record)).where(eq(postsTable.id, record.id));
      } else {
        await db
          .insert(postsTable)
          .values({ id: record.id, createdAt: record.createdAt, ...columnsFor(record) });
      }
    },

    async remove(id) {
      await db.delete(postsTable).where(eq(postsTable.id, id));
    },

    async countsByAuthor(author) {
      const [row] = await db
        .select({
          total: sql<number>`COUNT(*)`,
          published: sql<number>`SUM(CASE WHEN ${postsTable.status} = 'published' THEN 1 ELSE 0 END)`,
          drafts: sql<number>`SUM(CASE WHEN ${postsTable.status} = 'draft' THEN 1 ELSE 0 END)`,
        })
        .from(postsTable)
        .where(eq(postsTable.author, author));

      // SUM answers null rather than 0 for an Editor who has written nothing yet.
      return {
        total: row?.total ?? 0,
        published: row?.published ?? 0,
        drafts: row?.drafts ?? 0,
      };
    },
  };
}

/** Local substitute for the editorial record, so Post Lifecycle needs no database. */
export class InMemoryPostStore implements PostStore {
  private records = new Map<string, PostRecord>();

  constructor(seed: PostRecord[] = []) {
    for (const record of seed) this.records.set(record.id, record);
  }

  async find(id: string): Promise<PostRecord | null> {
    return this.records.get(id) ?? null;
  }

  async findBySlug(slug: string): Promise<PostRecord | null> {
    return (
      [...this.records.values()].find((record) => record.slug === slug) ?? null
    );
  }

  async list(): Promise<PostRecord[]> {
    return [...this.records.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async slugTaken(slug: string, exceptId: string): Promise<boolean> {
    return [...this.records.values()].some((record) => record.slug === slug && record.id !== exceptId);
  }

  async save(record: PostRecord): Promise<void> {
    this.records.set(record.id, { ...record });
  }

  async remove(id: string): Promise<void> {
    this.records.delete(id);
  }

  async countsByAuthor(author: string): Promise<AuthorCounts> {
    const written = [...this.records.values()].filter((record) => record.author === author);

    return {
      total: written.length,
      published: written.filter((record) => record.status === "published").length,
      drafts: written.filter((record) => record.status === "draft").length,
    };
  }

  /** Test helper: everything currently stored. */
  all(): PostRecord[] {
    return [...this.records.values()];
  }
}
