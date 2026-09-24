/**
 * Toolbar Actions.
 *
 * The Editor toolbar's insertions as one list, each naming the document text it inserts
 * with `|` where the Author's text belongs. So where the caret lands is a property of the
 * snippet rather than an offset counted by hand: the Code Block's cursor used to sit
 * between the two slashes of `// Code here`, because its offset was one character short of
 * the placeholder it was aiming for, and every action here was a `switch` arm inside the
 * editor's bootstrap where nothing could test it.
 *
 * The rules, in full:
 *
 * - The marker runs to the next `<` or the end of its line, whichever comes first. That
 *   span is the slot, and it is what the Author replaces.
 * - With a selection, the selected text goes in the slot and the caret ends up after the
 *   whole insertion.
 * - Without one, the slot keeps its placeholder and comes back *selected*, so the first
 *   keystroke replaces it instead of landing beside it.
 */

import { CARET, getToolbarActions, type ToolbarAction } from "blocks/toolbar";

export type { ToolbarAction };

/** The text to insert, and where the caret goes once it is in the document. */
export interface EditorChange {
  /** Replaces the current selection. */
  insert: string;
  /** Offsets into `insert`. A non-empty span means typing will replace it. */
  caret: { start: number; end: number };
}

/**
 * Every toolbar button the shipped blocks provide: inline marks plus each
 * registered block's declared entries, ordered. Removing a block removes its
 * buttons — the editor page renders this list, it never names tools itself.
 */
export const TOOLBAR_ACTIONS: ToolbarAction[] = getToolbarActions();

export function actionFor(id: string): ToolbarAction | undefined {
  return TOOLBAR_ACTIONS.find((action) => action.id === id);
}

/** The span the Author is expected to replace, marker included. */
function slot(snippet: string): { start: number; end: number } {
  const marker = snippet.indexOf(CARET);
  if (marker === -1) return { start: snippet.length, end: snippet.length };

  const rest = snippet.slice(marker + 1);
  const closers = [rest.indexOf("<"), rest.indexOf("\n")].filter((at) => at !== -1);
  const stop = closers.length > 0 ? Math.min(...closers) : rest.length;

  return { start: marker, end: marker + 1 + stop };
}

/** The text the Author is expected to replace, or empty for a bare caret. */
export function placeholderFor(action: ToolbarAction): string {
  const { start, end } = slot(action.snippet);
  return action.snippet.slice(start + 1, end);
}

export function actionChange(action: ToolbarAction, selectedText = ""): EditorChange {
  const { start, end } = slot(action.snippet);
  const placeholder = action.snippet.slice(start + 1, end);
  const insert =
    action.snippet.slice(0, start) + (selectedText || placeholder) + action.snippet.slice(end);

  return selectedText
    ? { insert, caret: { start: insert.length, end: insert.length } }
    : { insert, caret: { start, end: start + placeholder.length } };
}
