#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

/**
 * Deploy projector (ADR-0012 slow path).
 *
 * Re-derives the D1 Published View from the checkout the deploy already has:
 * every `src/content/blog/<slug>/index.mdx` with `draft: false` becomes a
 * `published` row; D1 `published` rows with no bundle are removed. Idempotent
 * by content: re-running for the same `main` writes the same rows.
 *
 * Runs after the build and migrations, before `wrangler deploy`, and blocks
 * the deploy on failure — the view must match what is about to be served.
 */

const CONTENT_DIR = resolve(process.cwd(), process.env.CONTENT_DIR || join("src", "content", "blog"));
const REVIEW_DIR = resolve(process.cwd(), process.env.REVIEW_DIR || ".review");
const SQL_PATH = join(REVIEW_DIR, "project.sql");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const sqlText = (value) => `'${String(value ?? "").replace(/'/g, "''")}'`;

function parseBundle(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw.trim() };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at === -1) continue;
    const key = line.slice(0, at).trim();
    let value = line.slice(at + 1).trim();
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1).replace(/''/g, "'");
    }
    if (key) data[key] = value;
  }
  return { data, body: (match[2] ?? "").trim() };
}

function isDraft(data) {
  return String(data.draft ?? "false").toLowerCase() === "true";
}

const slugs = existsSync(CONTENT_DIR)
  ? readdirSync(CONTENT_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : [];

const now = new Date().toISOString();
const rows = [];

for (const slug of slugs) {
  const file = join(CONTENT_DIR, slug, "index.mdx");
  if (!existsSync(file)) continue;
  const { data, body } = parseBundle(readFileSync(file, "utf-8"));
  if (isDraft(data)) continue;

  rows.push({
    id: randomUUID(),
    slug,
    title: data.title || slug,
    description: data.description || "",
    excerpt: data.excerpt || "",
    category: "General",
    tags: "[]",
    author: data.author || "jeflopo",
    featuredImage: data.heroImage || data.hero_image || "",
    contentMdx: body,
    status: "published",
    template: data.template || "default",
    defaultWidth: data.defaultWidth || data.default_width || "60rem",
    wideWidth: data.wideWidth || data.wide_width || "70rem",
    pubDate: data.pubDate || data.pub_date || now,
    createdAt: now,
    updatedAt: now,
  });
}

const statements = [];
for (const row of rows) {
  statements.push(
    `INSERT INTO posts (id, slug, title, description, excerpt, category, tags, author, featured_image, content_mdx, status, template, default_width, wide_width, pub_date, created_at, updated_at) VALUES (${sqlText(row.id)}, ${sqlText(row.slug)}, ${sqlText(row.title)}, ${sqlText(row.description)}, ${sqlText(row.excerpt)}, ${sqlText(row.category)}, ${sqlText(row.tags)}, ${sqlText(row.author)}, ${sqlText(row.featuredImage)}, ${sqlText(row.contentMdx)}, 'published', ${sqlText(row.template)}, ${sqlText(row.defaultWidth)}, ${sqlText(row.wideWidth)}, ${sqlText(row.pubDate)}, ${sqlText(row.createdAt)}, ${sqlText(row.updatedAt)}) ON CONFLICT(slug) DO UPDATE SET title = excluded.title, description = excluded.description, excerpt = excluded.excerpt, author = excluded.author, featured_image = excluded.featured_image, content_mdx = excluded.content_mdx, status = 'published', template = excluded.template, default_width = excluded.default_width, wide_width = excluded.wide_width, pub_date = excluded.pub_date, updated_at = excluded.updated_at;`
  );
}

if (rows.length > 0) {
  const list = rows.map((row) => sqlText(row.slug)).join(", ");
  statements.push(`DELETE FROM posts WHERE status = 'published' AND slug NOT IN (${list});`);
} else {
  statements.push(`DELETE FROM posts WHERE status = 'published';`);
}

mkdirSync(REVIEW_DIR, { recursive: true });
writeFileSync(SQL_PATH, `${statements.join("\n")}\n`, "utf-8");

if (process.env.PROJECT_DRY_RUN === "1") {
  console.log(`Published View projected (dry run): ${rows.length} Articles as of ${now}`);
  console.log(`SQL: ${SQL_PATH}`);
  process.exit(0);
}

try {
  execFileSync(pnpm, ["exec", "wrangler", "d1", "execute", "DB", "--remote", "--file", SQL_PATH], {
    stdio: "inherit",
    encoding: "utf-8",
  });
} catch {
  console.error("Could not project the Published View into D1. Deploy blocked.");
  process.exit(1);
} finally {
  if (process.env.PROJECT_KEEP_SQL !== "1") rmSync(SQL_PATH, { force: true });
}

console.log(`Published View projected: ${rows.length} Articles as of ${now}`);
