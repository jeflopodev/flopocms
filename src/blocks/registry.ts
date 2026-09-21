import type { BlockDefinition, EditorInsertion } from "./types";
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

/**
 * Editor drawer model.
 *
 * The drawer renders from this, so adding a block to the drawer adds no markup, and the
 * snippet it inserts is the block's own. Labels, icons and insertions come from the
 * definitions, keeping the registry the one place a block is described.
 */
interface DrawerEntry {
  type: string;
  description: string;
  preview: string;
  insertLabel: string;
}

const DRAWER: DrawerEntry[] = [
  {
    type: "callout",
    description: "Accessible alert callouts",
    preview: '<Callout variant="note">...</Callout>',
    insertLabel: "Callout",
  },
  {
    type: "list",
    description: "Nested list with custom list-style-type",
    preview: '<List type="unordered">...</List>',
    insertLabel: "Complex List",
  },
  {
    type: "amazon-product",
    description: "Product showcase with global assets",
    preview: '<AmazonProduct asin="B0..." price="$..." image="/uploads/..." />',
    insertLabel: "Product Block",
  },
  {
    type: "youtube",
    description: "Responsive video embed",
    preview: '<YouTube id="..." title="..." stretch="wide" />',
    insertLabel: "YouTube Video",
  },
  {
    type: "related-posts",
    description: "Other published Articles, read by category",
    preview: '<RelatedPosts category="Astro" limit={3} />',
    insertLabel: "Related Posts",
  },
  {
    type: "schema",
    description: "Structured FAQ / Article JSON-LD",
    preview: '<Schema type="FAQPage">...</Schema>',
    insertLabel: "Schema Block",
  },
];

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
 * The block cards the editor drawer renders, in order. A block with no DrawerEntry never
 * shows a card, which is how the toolbar-only blocks stay out of the drawer.
 */
export function getEditorBlockCards(): EditorBlockCard[] {
  return DRAWER.flatMap((entry) => {
    const block = getBlock(entry.type);
    if (!block) return [];

    return [
      {
        type: block.type,
        tagName: block.tagName,
        label: block.label,
        description: entry.description,
        icon: block.icon,
        category: block.category,
        preview: entry.preview,
        insertions: block.insertions?.length
          ? block.insertions
          : [{ label: `+ Insert ${entry.insertLabel}`, snippet: block.snippet }],
      },
    ];
  });
}
