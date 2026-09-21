import type * as v from "valibot";
import type { ArticleReadModel } from "../lib/article";

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

export interface BlockRenderContext {
  /** Article reads for blocks that need other Articles (e.g. RelatedPosts). */
  articles?: ArticleReadModel;
  post?: {
    id?: string;
    slug?: string;
    title?: string;
    category?: string;
    tags?: string[] | string;
    author?: string;
  };
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
