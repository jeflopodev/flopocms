import { describe, expect, it } from "vitest";
import { inspectDocument, parseDslToBlocks } from "./parser";
import { serializeBlocksToDsl } from "./serializer";
import { getEditorBlockCards } from "#/registry";
import type { BlockNode, InlineSpan } from "#/types";

/** Block trees minus minted ids: the stable shape a round trip must preserve. */
function stableShape(nodes: (BlockNode | InlineSpan)[]): unknown {
  return nodes.map((node) => {
    if ("text" in node) {
      return { text: node.text, marks: node.marks ?? [], markDefs: node.markDefs ?? [] };
    }
    return {
      type: node.type,
      props: node.props,
      children: node.children ? stableShape(node.children) : [],
    };
  });
}

describe("document round trip", () => {
  it("every drawer insertion survives parse, serialize, and re-parse unchanged", () => {
    const insertions = getEditorBlockCards().flatMap((card) =>
      card.insertions.map((insertion) => `${card.label}: ${insertion.label}`)
    );
    expect(insertions.length).toBeGreaterThan(0);

    for (const card of getEditorBlockCards()) {
      for (const insertion of card.insertions) {
        const label = `${card.label}: ${insertion.label}`;
        const first = inspectDocument(insertion.snippet);
        expect(first.problems, label).toEqual([]);

        const serialized = serializeBlocksToDsl(first.blocks);
        const second = inspectDocument(serialized);
        expect(second.problems, label).toEqual([]);
        expect(stableShape(second.blocks), label).toEqual(stableShape(first.blocks));
      }
    }
  });

  it("serializing twice reaches a fixpoint", () => {
    const bodies = [
      `<Heading level={2}>Title</Heading>\n<Paragraph>Body</Paragraph>`,
      `<Callout variant="tip">\n  <Paragraph>Tip body</Paragraph>\n</Callout>`,
      `Intro paragraph.\n\n<YouTube id="dQw4w9WgXcQ" />\n\nOutro paragraph.`,
    ];
    for (const body of bodies) {
      const once = serializeBlocksToDsl(parseDslToBlocks(body));
      const twice = serializeBlocksToDsl(parseDslToBlocks(once));
      expect(twice, body).toBe(once);
    }
  });
});

describe("bare prose contract", () => {
  const typesOf = (dsl: string) => inspectDocument(dsl).blocks.map((block) => block.type);

  it.each([
    ["a lone run of words", "Just some text", ["paragraph"]],
    ["blank line splits", "First paragraph.\n\nSecond paragraph.", ["paragraph", "paragraph"]],
    ["several blank lines still split once", "First.\n\n\n\nSecond.", ["paragraph", "paragraph"]],
    ["single break stays inside one paragraph", "line one\nline two", ["paragraph"]],
    ["whitespace alone is no paragraph", "   \n  \n ", []],
    [
      "custom blocks punctuate prose",
      `Intro paragraph.\n\n<YouTube id="dQw4w9WgXcQ" />\n\nOutro paragraph.`,
      ["paragraph", "youtube", "paragraph"],
    ],
  ])("%s", (_label, dsl, expected) => {
    expect(typesOf(dsl)).toEqual(expected);
    expect(inspectDocument(dsl).problems).toEqual([]);
  });
});
