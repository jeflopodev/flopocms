import { and, desc, eq, ne } from "drizzle-orm";
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

/**
 * D1's editorial record seam.
 *
 * Post Lifecycle needs four things from the editorial store, not a query builder, which
 * is what lets its draft/publish/unpublish transitions run against a substitute.
 */
export interface PostStore {
  find(id: string): Promise<PostRecord | null>;
  /** The editorial listing for the Admin Dashboard, most recently edited first. */
  list(): Promise<PostRecord[]>;
  /** Is this slug already used by a different Article? */
  slugTaken(slug: string, exceptId: string): Promise<boolean>;
  /** Writes the record, clearing the branch-and-PR bookkeeping ADR-0009 left behind. */
  save(record: PostRecord): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Columns from the ADR-0008 branch-and-PR era. Nothing sets them any more. */
const LEGACY_GIT_COLUMNS = { gitBranch: null, prNumber: null, prUrl: null };

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
    ...LEGACY_GIT_COLUMNS,
  });

  return {
    async find(id) {
      const [row] = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1);
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

  /** Test helper: everything currently stored. */
  all(): PostRecord[] {
    return [...this.records.values()];
  }
}
