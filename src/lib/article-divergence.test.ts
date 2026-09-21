import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { diffArticleStores, type Article } from "./article";
import {
  d1DumpPath,
  hasBothStores,
  readD1Dump,
  readMainSnapshot,
  writeMainSnapshot,
} from "./article-divergence";

function article(overrides: Partial<Article> & { slug: string }): Article {
  return {
    title: `Title ${overrides.slug}`,
    description: "",
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

/** A `posts` row as the check's SQL returns it: snake_case columns under camelCase aliases. */
function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: "published-one",
    title: "Title published-one",
    description: "",
    author: "jeflopo",
    category: "General",
    tags: "[]",
    featuredImage: "",
    contentMdx: "<Paragraph>Body</Paragraph>",
    status: "published",
    template: "default",
    defaultWidth: "60rem",
    wideWidth: "70rem",
    pubDate: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** The shape `wrangler d1 execute --json` prints. */
function dump(rows: Record<string, unknown>[]): string {
  return JSON.stringify([{ results: rows, success: true, meta: {} }]);
}

function withReviewDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "review-"));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("Article Store divergence artifacts", () => {
  it("reads back the snapshot the build wrote", () => {
    withReviewDir((dir) => {
      const articles = [article({ slug: "published-one" })];
      writeMainSnapshot(articles, dir);

      expect(readMainSnapshot(dir)).toEqual(articles);
    });
  });

  it("reads a wrangler dump through the same row mapper the editorial source uses", () => {
    withReviewDir((dir) => {
      writeFileSync(
        d1DumpPath(dir),
        dump([
          row({
            slug: "from-d1",
            status: "draft",
            tags: '["astro","d1"]',
            featuredImage: "/uploads/hero.webp",
            title: "From D1",
          }),
        ]),
        "utf-8"
      );

      const [mapped] = readD1Dump(dir);

      expect(mapped).toMatchObject({
        slug: "from-d1",
        title: "From D1",
        status: "draft",
        tags: ["astro", "d1"],
        heroImage: "/uploads/hero.webp",
        content: "<Paragraph>Body</Paragraph>",
      });
    });
  });

  it("reports nothing when main and the projection agree", () => {
    withReviewDir((dir) => {
      writeMainSnapshot([article({ slug: "published-one" })], dir);
      writeFileSync(d1DumpPath(dir), dump([row()]), "utf-8");

      expect(diffArticleStores(readMainSnapshot(dir), readD1Dump(dir))).toEqual([]);
    });
  });

  it("reports a published row that main has no bundle for", () => {
    withReviewDir((dir) => {
      writeMainSnapshot([], dir);
      writeFileSync(d1DumpPath(dir), dump([row({ slug: "deleted-by-hand" })]), "utf-8");

      expect(diffArticleStores(readMainSnapshot(dir), readD1Dump(dir))).toEqual([
        {
          slug: "deleted-by-hand",
          kind: "missing-from-main",
          detail: expect.stringContaining("main has no bundle"),
        },
      ]);
    });
  });
});

/**
 * The gate itself. It runs where both artifacts exist — after a build and a D1 dump in CI —
 * and skips everywhere else, so a local `pnpm test` never depends on a database.
 */
describe.skipIf(!hasBothStores())("the deployed Article stores", () => {
  it("holds the same Articles on main and in the D1 projection", () => {
    const divergences = diffArticleStores(readMainSnapshot(), readD1Dump());

    expect(
      divergences,
      `main and D1 disagree:\n${divergences.map((d) => `  ${d.slug}: ${d.detail}`).join("\n")}`
    ).toEqual([]);
  });
});
