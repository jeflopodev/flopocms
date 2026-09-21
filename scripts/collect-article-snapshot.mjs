#!/usr/bin/env node
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Moves the Git side of the divergence check out of the build output.
 *
 * The build emits it to `dist/client/review/articles.json` because a prerendered route is the only
 * place `astro:content` resolves. `dist/` is served as static assets, so the snapshot is
 * collected into `.review/` before `wrangler deploy` runs and never becomes a public URL.
 *
 * Run between `pnpm run build` and the divergence check.
 */

const from = resolve(process.cwd(), "dist", "client", "review", "articles.json");
const to = resolve(process.cwd(), process.env.REVIEW_DIR || ".review", "articles.json");

if (!existsSync(from)) {
  console.error(`No snapshot at ${from}. Did the build run?`);
  process.exit(1);
}

mkdirSync(dirname(to), { recursive: true });
renameSync(from, to);

console.log(`Article snapshot collected: ${to}`);
