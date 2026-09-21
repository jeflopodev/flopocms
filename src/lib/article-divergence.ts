import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Article } from "./article";
import { rowToArticle } from "./article-sources/d1";

/**
 * The Article Store divergence check.
 *
 * Published content is authoritative on `main` and Draft content in D1 (ADR-0011), which
 * means the two stores can drift without anyone noticing: a bundle deleted by hand, a row
 * edited in the console, an interrupted publish. `diffArticleStores` decides whether they
 * disagree; this module gets both sides into the same shape to ask it.
 *
 * The Git side cannot be read by a CLI script — `astro:content` exists only inside a build
 * — so the build writes it and CI dumps the other side. Both artifacts land in `.review/`,
 * deliberately outside `dist/`, which is served as static assets.
 *
 * This module uses the filesystem, so nothing in the Worker imports it: it belongs to the
 * build and to tests.
 */

export const REVIEW_DIR = process.env.REVIEW_DIR || ".review";

export const MAIN_SNAPSHOT_FILE = "articles.json";
export const D1_DUMP_FILE = "d1-posts.json";

export function mainSnapshotPath(dir: string = REVIEW_DIR): string {
  return resolve(join(dir, MAIN_SNAPSHOT_FILE));
}

export function d1DumpPath(dir: string = REVIEW_DIR): string {
  return resolve(join(dir, D1_DUMP_FILE));
}

/** Called once by the build, from the one route that can reach the content collection. */
export function writeMainSnapshot(articles: Article[], dir: string = REVIEW_DIR): string {
  const target = mainSnapshotPath(dir);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(
    target,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), articles }, null, 2)}\n`,
    "utf-8"
  );
  return target;
}

export function readMainSnapshot(dir: string = REVIEW_DIR): Article[] {
  const parsed = JSON.parse(readFileSync(mainSnapshotPath(dir), "utf-8")) as { articles?: Article[] };
  return parsed.articles ?? [];
}

/**
 * Reads the editorial record out of a `wrangler d1 execute --json` dump. The SQL aliases its
 * columns to the names the row mapper already understands, so there is one mapping from a
 * `posts` row to an Article rather than a second one written for the check.
 */
export function readD1Dump(dir: string = REVIEW_DIR): Article[] {
  const parsed = JSON.parse(readFileSync(d1DumpPath(dir), "utf-8")) as unknown;

  const rows: Record<string, unknown>[] = Array.isArray(parsed)
    ? parsed.flatMap((entry) => (Array.isArray((entry as any)?.results) ? (entry as any).results : [entry]))
    : Array.isArray((parsed as any)?.results)
      ? (parsed as any).results
      : [];

  return rows.map((row) => rowToArticle(row));
}

/** Both artifacts exist: the check has something to compare. */
export function hasBothStores(dir: string = REVIEW_DIR): boolean {
  return existsSync(mainSnapshotPath(dir)) && existsSync(d1DumpPath(dir));
}
