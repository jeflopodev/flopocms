#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Dumps the editorial record for the Article Store divergence check.
 *
 * The Git side of that check comes from the build, because `astro:content` exists only
 * inside one. This is the other side: the deployed D1 database, read through
 * `scripts/d1-posts.sql`, whose column aliases mean the check translates rows with the same
 * mapper the Live Draft Preview uses.
 *
 * Needs Cloudflare credentials in the environment, so it runs in CI (and by hand) rather
 * than as part of `pnpm test`.
 */

const target = resolve(process.cwd(), process.env.REVIEW_DIR || ".review", "d1-posts.json");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

let output;
try {
  output = execFileSync(
    pnpm,
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--remote",
      "--json",
      "--file",
      "scripts/d1-posts.sql",
    ],
    { encoding: "utf-8", stdio: ["ignore", "pipe", "inherit"] }
  );
} catch (err) {
  console.error("Could not read D1. Is wrangler authenticated for this account?");
  process.exit(1);
}

// Wrangler prints its banner on stdout in some versions; keep from the first JSON token.
const start = output.search(/[[{]/);
if (start === -1) {
  console.error("Wrangler returned no JSON. Dump aborted.");
  process.exit(1);
}

const json = output.slice(start);
JSON.parse(json); // Fail here rather than in the check.

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, json, "utf-8");

console.log(`D1 projection dumped: ${target}`);
