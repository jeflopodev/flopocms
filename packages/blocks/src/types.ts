import type * as v from "valibot";
import type { ToolbarAction } from "./toolbar";

export type Mark = "bold" | "italic" | "strike" | "code" | "underline";

export interface MarkDef {
  id: string;
  type: "link" | "annotation";
  attrs: Record<string, any>;
}

export interface InlineSpan {
  type: "text";
  text: string;
  marks?: Mark[];
  markDefs?: MarkDef[];
}

export interface BlockNode<TProps = Record<string, any>> {
  id: string;
  type: string;
  props: TProps;
  children?: (BlockNode | InlineSpan)[];
}

/**
 * The Article a block is rendered inside, as the Document Renderer carries it.
 *
 * Every field is required, which is the point: the two surfaces that render an Article used
 * to hand the renderer differently-shaped objects, so a block could read a field that was
 * populated on one surface and absent on the other. **Article Display** is the only producer.
 */
export interface BlockArticleContext {
  id: string;
  slug: string;
  title: string;
  author: string;
  category: string;
}

/**
 * The article reads a block needs, as the blocks package sees them.
 *
 * Structural on purpose: the CMS satisfies this interface with its Article Read
 * Model without either package importing the other, so deleting a block file
 * takes nothing outside this package with it.
 */
export interface BlockRelatedArticle {
  slug: string;
  title: string;
  category: string;
  description?: string;
}

export interface BlockArticleSource {
  listRelated(options: {
    category?: string;
    excludeSlug?: string;
    limit?: number;
  }): Promise<BlockRelatedArticle[]>;
}

export interface BlockRenderContext {
  /** Article reads for blocks that need other Articles (e.g. RelatedPosts). */
  articles?: BlockArticleSource;
  post?: BlockArticleContext;
  env?: any;
  isDraftPreview?: boolean;
}

export interface SchemaEntity {
  "@type": string;
  "@id"?: string;
  [key: string]: any;
}

export interface EditorInsertion {
  label: string;
  snippet: string;
}

export interface EditorBlockDrawerMeta {
  description: string;
  preview: string;
  insertLabel?: string;
  order?: number;
}

export interface BlockDefinition<TProps = any, TData = any> {
  /** Canonical block type identifier, e.g. "paragraph", "callout", "youtube" */
  type: string;

  /** JSX Tag name used in the DSL, e.g. "Paragraph", "Callout", "YouTube" */
  tagName: string;

  /** Human-readable title for UI & drawer */
  label: string;

  /** Category in the editor block drawer */
  category: "text" | "media" | "commerce" | "embed" | "meta";

  /** SVG Icon for UI & drawer */
  icon: string;

  /** Valibot schema for props validation */
  schema: v.BaseSchema<any, TProps, any>;

  /** Default props when inserting or creating a block */
  defaultProps?: Partial<TProps>;

  /** Default JSX snippet template for editor insertion */
  snippet: string;

  /**
   * Additional insertions the drawer offers for this block, each a labelled snippet
   * (e.g. one per Callout variant). When absent, the drawer offers `snippet` alone.
   */
  insertions?: EditorInsertion[];

  /**
   * Presentation metadata for the Editor Blocks Drawer.
   * When defined, the block appears as a card in the drawer.
   * When absent or omitted, the block is excluded from the drawer (e.g. toolbar-only blocks).
   */
  drawer?: EditorBlockDrawerMeta;

  /**
   * Toolbar buttons this block contributes. The editor page renders its toolbar
   * from `getToolbarActions()`, so removing the block removes its buttons:
   * a button whose block is gone can no longer be published.
   */
  toolbar?: ToolbarAction[];

  /** Whether this block supports CSS breakout stretch ("default" | "wide" | "full" | custom) */
  supportsStretch?: boolean;

  /**
   * Self-contained server-side data fetching.
   * Runs asynchronously before rendering (e.g. RelatedPosts querying D1).
   */
  loadServerData?: (props: TProps, ctx: BlockRenderContext) => Promise<TData>;

  /**
   * Self-contained JSON-LD structured data generator.
   * Synthesizes Schema.org entities directly from the block's props and data.
   */
  generateJsonLd?: (props: TProps, data?: TData) => SchemaEntity | SchemaEntity[] | null;

  /**
   * Self-contained rendering logic: renders HTML string.
   */
  render: (props: TProps, childrenHtml: string, data?: TData, ctx?: BlockRenderContext) => string;

  /** Self-contained CSS styles for this block */
  styles?: string;
}
