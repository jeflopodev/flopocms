import { describe, expect, it } from "vitest";
import { inspectDocument, parseDslToBlocks } from "./parser";
import { getAllBlocks, getEditorBlockCards } from "../registry";

const problemsOf = (dsl: string) => inspectDocument(dsl).problems;

describe("inspectDocument", () => {
  it("finds nothing in a document it can resolve", () => {
    const inspection = inspectDocument(`<Heading level={2}>Title</Heading>\n<Paragraph>Body</Paragraph>`);

    expect(inspection.problems).toEqual([]);
    expect(inspection.blocks).toHaveLength(2);
  });

  it("reports a tag no Block is registered for, and still parses the rest", () => {
    const problems = problemsOf(`<Ul list-style-type="disc">\n  <ListItem>One</ListItem>\n</Ul>`);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ severity: "unrenderable", code: "unknown-block", tagName: "Ul" });
    expect(problems[0].message).toContain("<Ul>");
  });

  it("reports props that do not match the Block's schema, naming the prop", () => {
    const problems = problemsOf(`<Image alt="No source" />`);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ severity: "suspect", code: "invalid-props", tagName: "Image" });
    expect(problems[0].message).toContain("src");
  });

  it("reports a tag that is never closed", () => {
    const problems = problemsOf(`<Callout type="info">\n  <Paragraph>Half typed`);

    expect(problems.map((problem) => problem.code)).toContain("recovered-tag");
    expect(problems.some((problem) => problem.message.includes("<Callout> is never closed"))).toBe(true);
    expect(problems.every((problem) => problem.severity === "unrenderable")).toBe(true);
  });

  it("reports a closing tag with nothing to close", () => {
    const problems = problemsOf(`<Paragraph>Body</Quote>`);

    expect(problems.some((problem) => problem.message.includes("</Quote> has no opening tag"))).toBe(true);
  });

  it("refuses a closing block tag glued to text, naming the line", () => {
    // Observed live: the preview renders `<Tag>\ntext</Tag>` fine, but Astro's MDX
    // loader rejects it and the deploy reds. Single-line elements and closings
    // alone on their line are the legal spellings.
    const problems = problemsOf(`<Paragraph>\nBody text</Paragraph>`);

    expect(problems).toEqual([
      expect.objectContaining({
        severity: "suspect",
        code: "closing-tag-not-alone",
        tagName: "Paragraph",
      }),
    ]);
    expect(problems[0].message).toContain("line 2");
  });

  it("accepts closings alone on their line or sharing it with their opening tag", () => {
    expect(problemsOf(`<Paragraph>Body</Paragraph>`)).toEqual([]);
    expect(problemsOf(`<Paragraph>\nBody\n</Paragraph>`)).toEqual([]);
    expect(
      problemsOf(`<Callout variant="note">\n  <Paragraph>Body</Paragraph>\n</Callout>`)
    ).toEqual([]);
  });

  it("ignores inline marks, self-closing tags, and tags no Block owns", () => {
    expect(problemsOf(`<Paragraph><Bold>hi</Bold></Paragraph>`)).toEqual([]);
    expect(problemsOf(`<YouTube id="x" />`)).toEqual([]);
    expect(problemsOf(`<Mystery>\ntext</Mystery>`).map((problem) => problem.code)).not.toContain(
      "closing-tag-not-alone"
    );
  });

  it("reports an unterminated comment swallowing the rest of the document", () => {
    const problems = problemsOf(`<Paragraph>Body</Paragraph>\n<!-- half a note`);

    expect(problems).toEqual([
      expect.objectContaining({ severity: "unrenderable", code: "unterminated-comment" }),
    ]);
  });

  it("leaves a reader's view of a broken document alone", () => {
    // Recovery is what makes rendering total; inspecting the document does not change it.
    const dsl = `<Ul><ListItem>One</ListItem></Ul>`;
    const parsed = parseDslToBlocks(dsl);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].type).toBe("ul");
    expect(parsed[0].children).toHaveLength(1);
    expect(inspectDocument(dsl).blocks.map((block) => block.type)).toEqual(parsed.map((block) => block.type));
  });
});

describe("bare prose paragraphs", () => {
  it("wraps bare text in a paragraph with no problems", () => {
    const inspection = inspectDocument(`Just some text`);

    expect(inspection.problems).toEqual([]);
    expect(inspection.blocks).toHaveLength(1);
    expect(inspection.blocks[0]).toMatchObject({ type: "paragraph" });
  });

  it("splits paragraphs on a blank line", () => {
    const inspection = inspectDocument(`First paragraph.\n\nSecond paragraph.`);

    expect(inspection.problems).toEqual([]);
    expect(inspection.blocks.map((block) => block.type)).toEqual(["paragraph", "paragraph"]);
  });

  it("treats several blank lines as one break", () => {
    const inspection = inspectDocument(`First.\n\n\n\nSecond.`);

    expect(inspection.problems).toEqual([]);
    expect(inspection.blocks).toHaveLength(2);
  });

  it("keeps a single line break inside one paragraph", () => {
    const inspection = inspectDocument(`line one\nline two`);

    expect(inspection.problems).toEqual([]);
    expect(inspection.blocks).toHaveLength(1);
    expect(inspection.blocks[0].type).toBe("paragraph");
  });

  it("mixes bare paragraphs with custom blocks", () => {
    const inspection = inspectDocument(
      `Intro paragraph.\n\n<YouTube id="dQw4w9WgXcQ" />\n\nOutro paragraph.`
    );

    expect(inspection.problems).toEqual([]);
    expect(inspection.blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "youtube",
      "paragraph",
    ]);
  });

  it("keeps inline marks on the split paragraphs", () => {
    const inspection = inspectDocument(`<Bold>First</Bold>\n\nSecond`);

    expect(inspection.problems).toEqual([]);
    expect(inspection.blocks).toHaveLength(2);
    expect(inspection.blocks[0].children?.[0]).toMatchObject({ type: "text", marks: ["bold"] });
  });
});

describe("the insertions the registry offers", () => {
  it("every Block's own snippet is a document with no problems", () => {
    const snippets = getAllBlocks().flatMap((block) => [
      { label: `${block.tagName} snippet`, snippet: block.snippet },
      ...(block.insertions ?? []).map((insertion) => ({ label: `${block.tagName}: ${insertion.label}`, snippet: insertion.snippet })),
    ]);

    expect(snippets.length).toBeGreaterThan(0);

    for (const { label, snippet } of snippets) {
      expect(problemsOf(snippet), label).toEqual([]);
    }
  });

  it("every card the drawer shows offers a document with no problems", () => {
    const insertions = getEditorBlockCards().flatMap((card) =>
      card.insertions.map((insertion) => ({ label: `${card.label}: ${insertion.label}`, snippet: insertion.snippet }))
    );

    expect(insertions.length).toBeGreaterThan(0);

    for (const { label, snippet } of insertions) {
      expect(problemsOf(snippet), label).toEqual([]);
    }
  });
});
