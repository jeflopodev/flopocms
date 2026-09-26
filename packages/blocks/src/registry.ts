import type { BlockDefinition, EditorBlockDrawerMeta, EditorInsertion } from "./types";
import { assertBlockShape, assertBlockSlug, isBlockDefinition } from "./block-spec";

/**
 * Re-exported so the editor model stays the one place an editing rule is looked up.
 * Browser scripts import `./insertion` directly: this module pulls in every block
 * definition and renderer, which has no business in a client bundle.
 */
export { assetKindFor, insertionForAsset, type AssetInsertionInput, type AssetKind } from "./insertion";

const blockRegistry = new Map<string, BlockDefinition>();
const tagToTypeMap = new Map<string, string>();

/**
 * Registers a block definition into the central registry.
 *
 * Shape-checked so a malformed definition fails at startup rather than
 * half-rendering a reader's page. Folder ownership (folder == type) is
 * checked by the auto-loader below, which knows the folder.
 */
export function registerBlock(block: BlockDefinition): void {
  assertBlockShape(block, `registerBlock(${block?.type})`);
  const tagKey = block.tagName.toLowerCase();
  const owner = tagToTypeMap.get(tagKey);
  if (owner !== undefined && owner !== block.type) {
    throw new Error(`Duplicate tag <${block.tagName}>: already owned by "${owner}", rejected "${block.type}"`);
  }
  blockRegistry.set(block.type, block);
  tagToTypeMap.set(tagKey, block.type);
}

/**
 * Retrieves a block definition by its type identifier or JSX tag name.
 */
export function getBlock(identifier: string): BlockDefinition | undefined {
  ensureLoaded();
  if (!identifier) return undefined;
  const canonicalType = tagToTypeMap.get(identifier.toLowerCase()) || identifier.toLowerCase();
  return blockRegistry.get(canonicalType);
}

/**
 * Returns all registered block definitions.
 */
export function getAllBlocks(): BlockDefinition[] {
  ensureLoaded();
  return Array.from(blockRegistry.values());
}

/**
 * Checks if a given JSX tag name corresponds to a registered block.
 */
export function isRegisteredTag(tagName: string): boolean {
  ensureLoaded();
  return tagToTypeMap.has(tagName.toLowerCase());
}

/**
 * Aggregates CSS styles from all registered blocks into a single deduplicated stylesheet.
 */
export function getCombinedBlockStyles(): string {
  ensureLoaded();
  const styles: string[] = [];
  for (const block of blockRegistry.values()) {
    if (block.styles) {
      styles.push(`/* Block: ${block.type} */\n${block.styles.trim()}`);
    }
  }
  return styles.join("\n\n");
}

// Pluggable by folder: each `src/<slug>/index.ts` exports its block definition,
// and the folder name is the block slug. Adding a block is adding a folder —
// this list never names blocks, so core code never changes for a new block.
//
// Discovery is lazy on purpose: the bundler may emit a globbed namespace
// object after this module's body (native ESM live bindings hide this, the
// worker bundle does not), so iterating the namespaces must happen on first
// use — when every module in the graph has been evaluated — never at import.
const blockModules = import.meta.glob("./*/index.ts", { eager: true }) as Record<
  string,
  Record<string, unknown>
>;

let discoveryRan = false;

function ensureLoaded(): void {
  if (discoveryRan) return;
  discoveryRan = true;
  for (const [path, mod] of Object.entries(blockModules)) {
    if (!mod) continue;
    const slug = path.split("/")[1];
    for (const value of Object.values(mod)) {
      if (isBlockDefinition(value)) {
        assertBlockSlug(value, slug, path);
        registerBlock(value);
      }
    }
  }

  if (blockRegistry.size === 0) {
    throw new Error("Block registry is empty: no block definitions discovered under src/*/");
  }
}

export interface EditorBlockCard {
  type: string;
  tagName: string;
  label: string;
  description: string;
  icon: string;
  category: BlockDefinition["category"];
  preview: string;
  insertions: EditorInsertion[];
}

/**
 * The block cards the editor drawer renders, in order. Derived entirely from
 * the blocks package: a block with no drawer metadata never shows a card,
 * which is how the toolbar-only blocks stay out of the drawer.
 */
export function getEditorBlockCards(): EditorBlockCard[] {
  return getAllBlocks()
    .filter((block): block is BlockDefinition & { drawer: EditorBlockDrawerMeta } => Boolean(block.drawer))
    .sort((a, b) => (a.drawer.order ?? 99) - (b.drawer.order ?? 99))
    .map((block) => ({
      type: block.type,
      tagName: block.tagName,
      label: block.label,
      description: block.drawer.description,
      icon: block.icon,
      category: block.category,
      preview: block.drawer.preview,
      insertions: block.insertions?.length
        ? block.insertions
        : [{ label: `+ Insert ${block.drawer.insertLabel || block.label}`, snippet: block.snippet }],
    }));
}
