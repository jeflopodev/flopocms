import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TOOLBAR_ACTIONS, actionChange, actionFor, placeholderFor } from "./actions";
import { inspectDocument } from "../../blocks/dsl/parser";

/** The Editor page that publishes the toolbar buttons. */
const editorPage = readFileSync(
  fileURLToPath(new URL("../../pages/admin/posts/[id].astro", import.meta.url)),
  "utf8"
);

const offeredTools = [...editorPage.matchAll(/data-tool="([^"]+)"/g)].map((match) => match[1]);

/** Typing where the action says the caret will be. */
function typedInto(insert: string, caret: { start: number; end: number }, text: string): string {
  return insert.slice(0, caret.start) + text + insert.slice(caret.end);
}

/** The Block each action's insertion becomes once something is typed into it. */
const EXPECTED_TYPE: Record<string, string> = {
  bold: "paragraph",
  italic: "paragraph",
  strike: "paragraph",
  link: "paragraph",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  quote: "quote",
  code: "code",
  bullet: "list",
  numbered: "list",
};

describe("the toolbar's action list", () => {
  it("covers every button the toolbar publishes, and offers nothing else", () => {
    expect([...new Set(offeredTools)].sort()).toEqual(TOOLBAR_ACTIONS.map((action) => action.id).sort());

    for (const tool of offeredTools) expect(actionFor(tool), tool).toBeDefined();
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
