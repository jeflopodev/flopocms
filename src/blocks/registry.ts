import type { BlockDefinition, EditorBlockDrawerMeta, EditorInsertion } from "./types";
import { paragraphBlock } from "./paragraph";
import { headingBlock } from "./heading";
import { calloutBlock } from "./callout";
import { youtubeBlock } from "./youtube";
import { amazonProductBlock } from "./amazon-product";
import { listBlock, listItemBlock } from "./list";
import { quoteBlock } from "./quote";
import { codeBlock } from "./code";
import { relatedPostsBlock } from "./related-posts";
import { schemaBlock } from "./schema";
import { imageBlock } from "./image";

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
 */
export function registerBlock(block: BlockDefinition): void {
  blockRegistry.set(block.type, block);
  tagToTypeMap.set(block.tagName.toLowerCase(), block.type);
}

/**
 * Retrieves a block definition by its type identifier or JSX tag name.
 */
export function getBlock(identifier: string): BlockDefinition | undefined {
  if (!identifier) return undefined;
  const canonicalType = tagToTypeMap.get(identifier.toLowerCase()) || identifier.toLowerCase();
  return blockRegistry.get(canonicalType);
}

/**
 * Returns all registered block definitions.
 */
export function getAllBlocks(): BlockDefinition[] {
  return Array.from(blockRegistry.values());
}

/**
 * Checks if a given JSX tag name corresponds to a registered block.
 */
export function isRegisteredTag(tagName: string): boolean {
  return tagToTypeMap.has(tagName.toLowerCase());
}

/**
 * Aggregates CSS styles from all registered blocks into a single deduplicated stylesheet.
 */
export function getCombinedBlockStyles(): string {
  const styles: string[] = [];
  for (const block of blockRegistry.values()) {
    if (block.styles) {
      styles.push(`/* Block: ${block.type} */\n${block.styles.trim()}`);
    }
  }
  return styles.join("\n\n");
}

// Auto-register built-in blocks
[
  paragraphBlock,
  headingBlock,
  calloutBlock,
  youtubeBlock,
  amazonProductBlock,
  listBlock,
  listItemBlock,
  quoteBlock,
  codeBlock,
  relatedPostsBlock,
  schemaBlock,
  imageBlock,
].forEach(registerBlock);

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
 * The block cards the editor drawer renders, in order. A block with no drawer metadata never
 * shows a card, which is how the toolbar-only blocks stay out of the drawer.
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

