import { describe, expect, it } from "vitest";
import * as v from "valibot";
import {
  getAllBlocks,
  getBlock,
  getEditorBlockCards,
  registerCustomBlocks,
  getCombinedBlockClientScripts,
  resetBlockRegistry,
} from "./registry";
import { KEBAB_CASE_PATTERN, BLOCK_CATEGORIES } from "./block-spec";
import { htmlEscaper, renderDocument } from "./dsl/renderer";
import type { BlockDefinition, RawHtml } from "./types";

const XSS = '<script>alert("xss")</script>';
const emptyChildren = "" as RawHtml;

const blockModules = import.meta.glob("./*/index.ts", { eager: true }) as Record<
  string,
  Record<string, unknown>
>;

describe("block folders", () => {
  it("discovers blocks from folders with no hardcoded list", () => {
    expect(Object.keys(blockModules).length).toBeGreaterThan(0);
    expect(getAllBlocks().length).toBeGreaterThan(0);
  });

  it("uses kebab-case folder names that equal the block type", () => {
    for (const path of Object.keys(blockModules)) {
      const slug = path.split("/")[1];
      expect(slug, path).toMatch(KEBAB_CASE_PATTERN);
    }
    for (const block of getAllBlocks()) {
      expect(block.type, block.tagName).toMatch(KEBAB_CASE_PATTERN);
    }
  });

  it("registers unique types and tags", () => {
    const types = getAllBlocks().map((b) => b.type);
    const tags = getAllBlocks().map((b) => b.tagName.toLowerCase());
    expect(new Set(types).size).toBe(types.length);
    expect(new Set(tags).size).toBe(tags.length);
  });
});

describe("block specification", () => {
  it("gives every block a valibot schema, label, icon, category, snippet, and render", () => {
    for (const block of getAllBlocks()) {
      expect(block.schema, block.type).toBeDefined();
      expect(block.label, block.type).toBeTruthy();
      expect(block.icon, block.type).toContain("<svg");
      expect((BLOCK_CATEGORIES as readonly string[]), block.type).toContain(block.category);
      expect(block.snippet, block.type).toBeTruthy();
      expect(typeof block.render, block.type).toBe("function");
      // The schema must be usable as a boundary: parsing never throws.
      expect(() => v.safeParse(block.schema, {}), block.type).not.toThrow();
    }
  });

  it("renders deterministically to a static string without throwing", () => {
    for (const block of getAllBlocks()) {
      const first = block.render({}, emptyChildren, undefined, {}, htmlEscaper);
      const second = block.render({}, emptyChildren, undefined, {}, htmlEscaper);
      expect(typeof first, block.type).toBe("string");
      expect(first, block.type).toBe(second);
    }
  });

  it("declares every interpolated value through the escaper, per position", () => {
    const probe = {
      title: XSS,
      caption: XSS,
      alt: XSS,
      text: XSS,
      category: XSS,
      src: XSS,
      href: XSS,
      id: XSS,
      cite: XSS,
      author: XSS,
      stretch: XSS,
      listStyle: XSS,
      code: XSS,
      lang: XSS,
    };
    for (const block of getAllBlocks()) {
      const html = block.render(probe, emptyChildren, undefined, {}, htmlEscaper);
      expect(html, `${block.type} attr/text positions`).not.toContain('<script>alert("xss")</script>');
      expect(html, `${block.type} attr quotes`).not.toContain(`"${XSS}"`);
    }
  });

  it("passes renderer-built children through raw, unescaped", () => {
    for (const block of getAllBlocks()) {
      const kids = "<p class=\"prose-p\">kept</p>" as RawHtml;
      const html = block.render({}, kids, undefined, {}, htmlEscaper);
      if (html.includes("kept")) {
        expect(html, block.type).toContain("<p");
        expect(htmlEscaper.raw(kids), block.type).toBe(kids as string);
      }
    }
  });

  it("emits valid JSON-LD entities or nothing", () => {
    for (const block of getAllBlocks()) {
      if (!block.generateJsonLd) continue;
      const res = block.generateJsonLd({}, undefined);
      if (res === null) continue;
      const entities = Array.isArray(res) ? res : [res];
      for (const entity of entities) {
        expect(typeof entity["@type"], block.type).toBe("string");
        if (entity["@id"] !== undefined) expect(typeof entity["@id"], block.type).toBe("string");
      }
    }
  });
});

describe("block reusability", () => {
  const sources = import.meta.glob("./*/index.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;

  it("imports only shared block primitives, never the CMS or frameworks", () => {
    const forbidden = ["cms/", "astro", "cloudflare", "drizzle", "process.env", "@astrojs"];
    for (const [path, source] of Object.entries(sources)) {
      for (const pattern of forbidden) {
        expect(source, `${path} imports ${pattern}`).not.toContain(pattern);
      }
    }
  });

  it("never imports escaping helpers: values go through the render escaper", () => {
    for (const [path, source] of Object.entries(sources)) {
      expect(source, `${path} bypasses the escaper`).not.toContain("../html");
      expect(source, `${path} bypasses the escaper`).not.toContain("escapeAttr(");
      expect(source, `${path} bypasses the escaper`).not.toContain("escapeHtml(");
    }
  });
});

describe("blocks panel derivation", () => {
  it("derives every card from the blocks package with drawer order", () => {
    const cards = getEditorBlockCards();
    const drawerBlocks = getAllBlocks().filter((b) => b.drawer);
    expect(cards).toHaveLength(drawerBlocks.length);
    for (const card of cards) {
      expect(card.label).toBeTruthy();
      expect(card.description).toBeTruthy();
      expect(card.icon).toContain("<svg");
      expect(card.preview).toBeTruthy();
      expect(card.insertions.length).toBeGreaterThan(0);
    }
    const orders = cards.map((c) => getAllBlocks().find((b) => b.type === c.type)?.drawer?.order ?? 99);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });
});

describe("document JSON-LD", () => {
  it("emits a single @graph with unique @ids and no manual schema block", () => {
    const types = getAllBlocks().map((b) => b.type);
    expect(types).not.toContain("schema");
    return renderDocument(
      `<Heading level={2}>Title</Heading>\n<YouTube id="dQw4w9WgXcQ" title="Video" />\n<AmazonProduct asin="B08N5WRWNW" title="Widget" />`
    ).then(({ jsonLd }) => {
      expect(jsonLd["@context"]).toBe("https://schema.org");
      expect(jsonLd["@graph"][0]["@type"]).toBe("BlogPosting");
      const ids = jsonLd["@graph"].map((e: any) => e["@id"]).filter(Boolean);
      expect(new Set(ids).size).toBe(ids.length);
      for (const entity of jsonLd["@graph"]) {
        expect(typeof entity["@type"]).toBe("string");
      }
    });
  });

  it("shares dynamic fetches between identical blocks without changing output", async () => {
    let calls = 0;
    const ctx = {
      articles: {
        listRelated: async () => {
          calls++;
          return [];
        },
      },
      post: { id: "x", slug: "x", title: "X", author: "jeflopo", category: "General" },
    };
    const body = `<RelatedPosts category="General" limit={3} />\n<RelatedPosts category="General" limit={3} />`;
    const first = await renderDocument(body, ctx);
    expect(calls).toBe(1);
    expect(first.html).toBe((await renderDocument(body, ctx)).html);
  });
});

describe("custom block registration and client scripts", () => {
  const dummyCustomBlock: BlockDefinition = {
    type: "test-custom-poll",
    tagName: "TestCustomPoll",
    label: "Custom Poll",
    category: "embed",
    icon: "<svg>test</svg>",
    snippet: "<TestCustomPoll />",
    schema: v.object({
      pollId: v.optional(v.string()),
    }),
    render: (props, _children, _data, _ctx, h) =>
      `<custom-poll-widget data-id="${h.attr(props.pollId || 'default')}"></custom-poll-widget>`,
    styles: "custom-poll-widget { display: block; }",
    clientScript: "class CustomPoll extends HTMLElement {} customElements.define('custom-poll-widget', CustomPoll);",
    drawer: {
      description: "Test poll drawer card",
      preview: "<TestCustomPoll />",
      order: 10,
    },
  };

  it("registers a custom block and exposes it to getBlock and renderDocument", async () => {
    registerCustomBlocks([dummyCustomBlock]);

    expect(getBlock("TestCustomPoll")).toBeDefined();
    expect(getBlock("test-custom-poll")?.type).toBe("test-custom-poll");

    const result = await renderDocument('<TestCustomPoll pollId="p-123" />');
    expect(result.html).toContain('data-id="p-123"');
    expect(result.styles).toContain("custom-poll-widget");
    expect(result.scripts).toContain("customElements.define('custom-poll-widget'");
  });

  it("refuses duplicate tags by default, and allows override when configured", () => {
    // Attempting to register another block with the same tag without override throws
    const conflictingBlock: BlockDefinition = {
      ...dummyCustomBlock,
      type: "different-type",
    };
    expect(() => registerCustomBlocks([conflictingBlock], false)).toThrow("Duplicate tag <TestCustomPoll>");

    // With allowOverride: true, it successfully replaces it
    expect(() => registerCustomBlocks([conflictingBlock], true)).not.toThrow();
    expect(getBlock("TestCustomPoll")?.type).toBe("different-type");
  });
});
