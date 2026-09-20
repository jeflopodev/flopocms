import type { BlockDefinition } from "./types";
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
