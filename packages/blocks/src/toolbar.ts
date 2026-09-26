import { CARET } from "./marks";
import { linkSnippet, markSnippet } from "./dsl/marks";
import { getAllBlocks } from "./registry";
import type { Mark } from "./types";

export { CARET };

/**
 * One editor toolbar button. Blocks declare these on their definitions; inline
 * marks declare theirs below. The editor page renders its toolbar from
 * `getToolbarActions()`, so the shipped set is data — never markup that can drift.
 */
export interface ToolbarAction {
  /** The `data-tool` the toolbar markup publishes. */
  id: string;
  /** Button title and accessible name. */
  title: string;
  /** Inner HTML of the button: text or an inline SVG. Authored in-repo, never user input. */
  bodyHtml: string;
  /** Insertion text with the caret marker where the author's text belongs. */
  snippet: string;
  /** Visual group; groups render in first-seen order with dividers between. */
  group: string;
  /** Position inside the toolbar. Explicit, so a new block picks a slot deliberately. */
  order: number;
}

export interface ToolbarGroup {
  id: string;
  /** Extra class for the group's wrapper (e.g. the headings group hook). */
  groupClass?: string;
}

export const TOOLBAR_GROUPS: ToolbarGroup[] = [
  { id: "format" },
  { id: "headings", groupClass: "headings-group" },
  { id: "insert" },
  { id: "lists" },
];

const markTool = (id: Mark, title: string, bodyHtml: string, order: number): ToolbarAction => ({
  id,
  title,
  bodyHtml,
  snippet: markSnippet(id, CARET),
  group: "format",
  order,
});

/** Inline-mark buttons: marks are a closed set, so these are spelled out, not derived. */
const MARK_TOOLS: ToolbarAction[] = [
  markTool("bold", "Bold", "<strong>B</strong>", 10),
  markTool("italic", "Italic", "<em>I</em>", 20),
  markTool("strike", "Strikethrough", "<s>S</s>", 30),
  {
    id: "link",
    title: "Link",
    bodyHtml: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
    snippet: linkSnippet(`${CARET}link text`),
    group: "insert",
    order: 100,
  },
];

/**
 * Every toolbar button the shipped blocks provide: marks plus each registered
 * block's declared entries, ordered. Removing a block removes its buttons;
 * adding one picks an order and a group.
 */
export function getToolbarActions(): ToolbarAction[] {
  const blockTools = getAllBlocks().flatMap((block) => block.toolbar ?? []);
  return [...MARK_TOOLS, ...blockTools].sort((a, b) => a.order - b.order);
}

/** The registered block type contributing a toolbar button, if any. */
export function owningBlockType(toolId: string): string | undefined {
  return getAllBlocks().find((block) => block.toolbar?.some((tool) => tool.id === toolId))?.type;
}
