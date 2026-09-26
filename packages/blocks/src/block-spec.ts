import type { BlockDefinition } from "./types";

export const BLOCK_CATEGORIES = ["text", "media", "commerce", "embed", "meta"] as const;

export type BlockCategory = (typeof BLOCK_CATEGORIES)[number];

/** Folder names, file names, and block `type` values share this spelling. */
export const KEBAB_CASE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Block folder contract.
 *
 * - One folder per block under `src/<slug>/`, where `<slug>` is kebab-case
 *   and equals the block's `type`.
 * - `index.ts` exports exactly one `BlockDefinition`.
 * - `schema.ts` holds the Valibot schema the definition references.
 * - `*.test.ts` covers schema, render, and JSON-LD.
 * - Blocks are static HTML renderers: `render` returns a string, styles are
 *   self-contained CSS, and dynamic data arrives only through
 *   `loadServerData(props, ctx)` — never through direct store, CMS, or
 *   framework imports.
 */
export function isBlockDefinition(value: unknown): value is BlockDefinition {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.type === "string" &&
    typeof candidate.tagName === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.category === "string" &&
    typeof candidate.icon === "string" &&
    typeof candidate.snippet === "string" &&
    typeof candidate.schema === "object" &&
    candidate.schema !== null &&
    typeof candidate.render === "function"
  );
}

/**
 * Shape validation shared by the registry (fail fast at startup) and the
 * contract test (pin the spec per block).
 */
export function assertBlockShape(block: BlockDefinition, source: string): void {
  const problems: string[] = [];
  if (!KEBAB_CASE_PATTERN.test(block.type)) problems.push(`type "${block.type}" must be kebab-case`);
  if (!block.tagName) problems.push("tagName is required");
  if (!block.label) problems.push("label is required");
  if (!(BLOCK_CATEGORIES as readonly string[]).includes(block.category)) {
    problems.push(`category "${block.category}" must be one of ${BLOCK_CATEGORIES.join(", ")}`);
  }
  if (!block.icon.includes("<svg")) problems.push("icon must be inline SVG");
  if (!block.snippet) problems.push("snippet is required");
  if (!block.schema) problems.push("valibot schema is required");
  if (typeof block.render !== "function") problems.push("render is required");
  if (problems.length > 0) {
    throw new Error(`Invalid block definition in ${source}: ${problems.join("; ")}`);
  }
}

/** Folder ownership: the folder name is the block slug, so it must equal `type`. */
export function assertBlockSlug(block: BlockDefinition, slug: string, source: string): void {
  assertBlockShape(block, source);
  if (block.type !== slug) {
    throw new Error(`Block folder "${slug}" must export type "${slug}" but exports "${block.type}" (${source})`);
  }
}
