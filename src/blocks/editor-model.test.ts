import { describe, expect, it } from "vitest";
import { getEditorBlockCards, getBlock } from "./registry";
import { MARK_TAGS, linkSnippet, markSnippet } from "./marks";
import { parseDslToBlocks } from "./dsl/parser";
import { serializeBlocksToDsl } from "./dsl/serializer";
import type { Mark } from "./types";

const MARKS: Mark[] = ["bold", "italic", "strike", "code", "underline"];

describe("editor drawer cards", () => {
  const cards = getEditorBlockCards();

  it("renders one card per drawer block, in drawer order", () => {
    expect(cards.map((c) => c.type)).toEqual([
      "callout",
      "list",
      "amazon-product",
      "youtube",
      "related-posts",
      "schema",
    ]);
  });

  it("describes every card well enough to render it", () => {
    for (const card of cards) {
      expect(card.label).toBeTruthy();
      expect(card.description).toBeTruthy();
      expect(card.icon).toContain("<svg");
      expect(card.preview).toBeTruthy();
      expect(card.insertions.length).toBeGreaterThan(0);
      expect(card.tagName).toBe(getBlock(card.type)?.tagName);
    }
  });

  it("takes insertion snippets from the block definition rather than retyping them", () => {
    const single = cards.filter((card) => card.insertions.length === 1);
    expect(single.length).toBeGreaterThan(0);

    for (const card of single) {
      expect(card.insertions[0].snippet).toBe(getBlock(card.type)?.snippet);
    }
  });

  it("offers one button per Callout variant", () => {
    const callout = cards.find((card) => card.type === "callout");
    expect(callout?.insertions.map((i) => i.label)).toEqual([
      "Note",
      "Tip",
      "Important",
      "Warning",
      "Caution",
    ]);
    expect(callout?.insertions[1].snippet).toContain('variant="tip"');
  });
});

describe("drawer insertions produce valid blocks", () => {
  const cards = getEditorBlockCards();

  it.each(cards.flatMap((card) => card.insertions.map((i) => [card.type, i.snippet] as const)))(
    "the %s insertion parses back to a block of its own type",
    (type, snippet) => {
      const blocks = parseDslToBlocks(snippet);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe(type);
    }
  );
});

describe("inline mark DSL", () => {
  it.each(MARKS)("a %s snippet parses back to that mark", (mark) => {
    const [paragraph] = parseDslToBlocks(`<Paragraph>${markSnippet(mark, "text")}</Paragraph>`);

    expect(paragraph.type).toBe("paragraph");
    expect(paragraph.children?.[0]).toMatchObject({ type: "text", text: "text", marks: [mark] });
  });

  it("collects nested marks in the order they were opened", () => {
    const snippet = `<Paragraph>${markSnippet("bold", markSnippet("italic", "both"))}</Paragraph>`;
    const [paragraph] = parseDslToBlocks(snippet);
    const span = paragraph.children?.[0] as any;

    expect(span.text).toBe("both");
    // Note: the serializer applies marks in this same order, which reverses the nesting
    // of the source on a round trip. Recorded here rather than papered over.
    expect(span.marks).toEqual(["bold", "italic"]);
  });

  it("a link snippet parses back to a Mark Ref with its href", () => {
    const [paragraph] = parseDslToBlocks(`<Paragraph>${linkSnippet("docs", "https://astro.build")}</Paragraph>`);
    const span = paragraph.children?.[0] as any;

    expect(span.text).toBe("docs");
    expect(span.markDefs[0]).toMatchObject({ type: "link", attrs: { href: "https://astro.build" } });
  });

  it("serializing a parsed mark reuses the same tag spelling", () => {
    const [paragraph] = parseDslToBlocks(`<Paragraph>${markSnippet("strike", "gone")}</Paragraph>`);
    expect(serializeBlocksToDsl([paragraph])).toContain(`<${MARK_TAGS.strike}>gone</${MARK_TAGS.strike}>`);
  });

  it("keeps every declared mark reachable through the tag table", () => {
    for (const mark of MARKS) {
      expect(markSnippet(mark, "x")).toBe(`<${MARK_TAGS[mark]}>x</${MARK_TAGS[mark]}>`);
    }
  });
});
