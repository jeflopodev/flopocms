import { describe, expect, it } from "vitest";
import type { BlockNode, InlineSpan, MarkDef } from "./types";
import { parseDslToBlocks } from "./dsl/parser";
import { renderDocument } from "./dsl/renderer";
import { serializeBlocksToDsl } from "./dsl/serializer";
import { assetKindFor, insertionForAsset } from "./insertion";

const imageAsset = {
  url: "/uploads/photo.webp",
  mimeType: "image/webp",
  label: "A photo of a cat",
  filename: "photo.webp",
};

const fileAsset = {
  url: "/uploads/q3-report.pdf",
  mimeType: "application/pdf",
  label: "Q3 report",
  filename: "q3-report.pdf",
};

/** The link a parsed insertion carries, wherever in the tree it landed. */
function linkDefOf(blocks: BlockNode[]): MarkDef | undefined {
  const spans = blocks.flatMap((block) => (block.children ?? []) as (BlockNode | InlineSpan)[]);
  return spans
    .flatMap((span) => ("markDefs" in span ? (span.markDefs ?? []) : []))
    .find((def) => def.type === "link");
}

describe("Asset Insertion", () => {
  it("inserts an image as an Image block rather than markdown", () => {
    const insertion = insertionForAsset(imageAsset);
    expect(insertion).not.toContain("![");

    const blocks = parseDslToBlocks(insertion);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("image");
    expect(blocks[0].props.src).toBe("/uploads/photo.webp");
    expect(blocks[0].props.alt).toBe("A photo of a cat");
  });

  it("inserts a non-image as a Paragraph holding a Link", () => {
    const insertion = insertionForAsset(fileAsset);
    const blocks = parseDslToBlocks(insertion);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("paragraph");
    expect(linkDefOf(blocks)?.attrs.href).toBe("/uploads/q3-report.pdf");
  });

  it("keeps a file's download name through the Link mark", () => {
    const blocks = parseDslToBlocks(insertionForAsset(fileAsset));
    expect(linkDefOf(blocks)?.attrs.download).toBe("q3-report.pdf");
  });

  it("renders an inserted image as a real figure", async () => {
    const { html } = await renderDocument(insertionForAsset(imageAsset));

    expect(html).toContain("<figure");
    expect(html).toContain('src="/uploads/photo.webp"');
    expect(html).toContain('alt="A photo of a cat"');
    // The defect this module exists to fix: markdown reaching the reader as its own
    // characters, because the renderer escapes text and only parses blocks and Marks.
    expect(html).not.toContain("![");
  });

  it("renders an inserted file as an anchor carrying the download attribute", async () => {
    const { html } = await renderDocument(insertionForAsset(fileAsset));

    expect(html).toContain('<a href="/uploads/q3-report.pdf" download="q3-report.pdf"');
    expect(html).toContain(">Q3 report</a>");
  });

  it("survives a save round trip without losing the download name", () => {
    const once = serializeBlocksToDsl(parseDslToBlocks(insertionForAsset(fileAsset)));
    const twice = serializeBlocksToDsl(parseDslToBlocks(once));

    expect(once).toContain('download="q3-report.pdf"');
    expect(twice).toBe(once);
  });

  it("names an asset by its label, then its filename, then its URL", () => {
    expect(insertionForAsset({ url: "/uploads/a.webp", mimeType: "image/webp" })).toBe(
      '<Image src="/uploads/a.webp" alt="a.webp" />'
    );
    expect(insertionForAsset({ url: "/uploads/nested/a.webp", mimeType: "image/webp" })).toContain(
      'alt="a.webp"'
    );
    expect(
      insertionForAsset({ url: "/uploads/a.webp", mimeType: "image/webp", filename: "stored.webp" })
    ).toContain('alt="stored.webp"');
    expect(
      insertionForAsset({ url: "/uploads/a.webp", mimeType: "image/webp", filename: "stored.webp", label: "Chosen" })
    ).toContain('alt="Chosen"');
  });

  it("escapes a quote in a label rather than breaking the DSL", () => {
    const insertion = insertionForAsset({ ...imageAsset, label: 'He said "hi"' });
    const blocks = parseDslToBlocks(insertion);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].props.alt).toBe("He said &quot;hi&quot;");
  });

  it("treats everything but image/* as a file", () => {
    expect(assetKindFor("image/svg+xml")).toBe("image");
    expect(assetKindFor("video/mp4")).toBe("file");
    expect(assetKindFor("")).toBe("file");
    expect(assetKindFor(undefined)).toBe("file");

    const video = insertionForAsset({ url: "/uploads/clip.mp4", mimeType: "video/mp4", filename: "clip.mp4" });
    expect(parseDslToBlocks(video)[0].type).toBe("paragraph");
  });
});
