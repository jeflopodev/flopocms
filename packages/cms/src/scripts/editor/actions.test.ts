import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TOOLBAR_ACTIONS, actionChange, actionFor, placeholderFor } from "./actions";
import { owningBlockType } from "blocks/toolbar";
import { inspectDocument } from "blocks/dsl/parser";

/**
 * The Editor page that publishes the toolbar buttons. A same-package contract test:
 * the page moved into the CMS package with the admin UI (ADR-0016); at repo-split
 * this file moves with it and reads its page by a same-package path again.
 */
const editorPage = readFileSync(
  fileURLToPath(new URL("../../routes/admin/posts/[id].astro", import.meta.url)),
  "utf8"
);

/** Typing where the action says the caret will be. */
function typedInto(insert: string, caret: { start: number; end: number }, text: string): string {
  return insert.slice(0, caret.start) + text + insert.slice(caret.end);
}

/**
 * The Block each action's insertion becomes once something is typed into it.
 * Marks always land in a paragraph; block tools resolve to the block type that
 * declares them, so removing a block prunes this map instead of breaking it.
 */
const EXPECTED_TYPE: Record<string, string> = {
  bold: "paragraph",
  italic: "paragraph",
  strike: "paragraph",
  link: "paragraph",
  ...Object.fromEntries(
    TOOLBAR_ACTIONS.map((action) => [action.id, owningBlockType(action.id)]).filter(
      (entry): entry is [string, string] => entry[1] !== undefined
    )
  ),
};

describe("the toolbar's action list", () => {
  it("publishes no hardcoded buttons: the page renders the shipped set", () => {
    // The page renders getToolbarActions(); a literal data-tool="..." would be a
    // button no block removal can take away.
    expect(editorPage).toContain("getToolbarActions");
    expect(editorPage.match(/data-tool="[^"]+"/g) ?? []).toEqual([]);
    expect(editorPage).toContain("data-tool={action.id}");
  });

  it("ships exactly the buttons the blocks provide, and offers nothing else", () => {
    expect(TOOLBAR_ACTIONS.map((action) => action.id).sort()).toEqual([
      "bold",
      "bullet",
      "code",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "italic",
      "link",
      "numbered",
      "quote",
      "strike",
    ]);

    for (const action of TOOLBAR_ACTIONS) expect(actionFor(action.id), action.id).toBeDefined();
  });

  it("gives each action an insertion the Document Parser can resolve completely", () => {
    for (const action of TOOLBAR_ACTIONS) {
      expect(inspectDocument(actionChange(action).insert).problems, `${action.id} empty`).toEqual([]);
      expect(
        inspectDocument(actionChange(action, "Selected text").insert).problems,
        `${action.id} with a selection`
      ).toEqual([]);
    }
  });

  it("inserts a Block of its own type once the Author types into it", () => {
    for (const action of TOOLBAR_ACTIONS) {
      const change = actionChange(action);
      const document = typedInto(change.insert, change.caret, "Typed");
      const blocks = inspectDocument(document).blocks;

      expect(blocks.length, action.id).toBeGreaterThan(0);
      expect(blocks[0].type, action.id).toBe(EXPECTED_TYPE[action.id]);
    }
  });

  it("keeps the caret inside the insertion", () => {
    for (const action of TOOLBAR_ACTIONS) {
      const { insert, caret } = actionChange(action);

      expect(caret.start, action.id).toBeLessThanOrEqual(insert.length);
      expect(caret.end, action.id).toBeLessThanOrEqual(insert.length);
      expect(caret.end, action.id).toBeGreaterThanOrEqual(caret.start);
    }
  });

  it("leaves no placeholder behind when the Author types", () => {
    // The property the Code Block's hand-counted offset broke: typing at the caret an
    // action reports has to land exactly where the placeholder was, not one character
    // before or after it.
    for (const action of TOOLBAR_ACTIONS) {
      const change = actionChange(action);
      const placeholder = placeholderFor(action);
      const document = typedInto(change.insert, change.caret, "Typed");

      if (placeholder) {
        expect(document, action.id).toBe(change.insert.replace(placeholder, "Typed"));
        expect(document, action.id).not.toContain(placeholder);
      }

      expect(inspectDocument(document).problems, action.id).toEqual([]);
    }
  });

  it("puts a selection in the slot and leaves the caret after the insertion", () => {
    for (const action of TOOLBAR_ACTIONS) {
      const { insert, caret } = actionChange(action, "Selected text");

      expect(insert.split("Selected text").length - 1, action.id).toBe(1);
      expect(caret, action.id).toEqual({ start: insert.length, end: insert.length });
      // The marker is a property of the action list, never of what reaches the document.
      expect(insert, action.id).not.toContain("|");
    }
  });

  it("ignores a tool the toolbar does not publish", () => {
    expect(actionFor("kilroy")).toBeUndefined();
  });
});
