import type { BlockNode, BlockRenderContext, HtmlEscaper, InlineSpan, RawHtml } from "../types";
import { parseDslToBlocks } from "./parser";
import { getBlock, getCombinedBlockStyles } from "../registry";

export interface RenderDocumentResult {
  html: string;
  blocks: BlockNode[];
  jsonLd: {
    "@context": "https://schema.org";
    "@graph": any[];
  };
  styles: string;
}

function escapeValue(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * The one escaper. Positions are declared by blocks and decided here:
 * `attr` and `text` escape, `raw` passes renderer-built markup through.
 * It is constructed here — never imported by blocks, which receive it as
 * the trailing `render` argument — and exported for direct `render` callers
 * such as tests.
 */
export const htmlEscaper: HtmlEscaper = {
  attr: (value) => escapeValue(value),
  text: (value) => escapeValue(value),
  raw: (html) => html as string,
};

function rawHtml(html: string): RawHtml {
  return html as RawHtml;
}

/** The `download` attribute of a link: absent, bare, or naming the file. */
function formatDownloadAttr(value: unknown): string {
  if (value === undefined || value === null || value === false || value === "") return "";
  if (value === true) return " download";
  return ` download="${htmlEscaper.attr(value)}"`;
}

function renderInlineSpans(
  children: (BlockNode | InlineSpan)[],
  serverDataMap: Map<string, any>,
  ctx?: BlockRenderContext
): string {
  return children
    .map((child) => {
      if ("type" in child && child.type !== "text") {
        return renderBlockNodeSync(child as BlockNode, serverDataMap, ctx);
      }
      const inline = child as InlineSpan;
      let text = htmlEscaper.text(inline.text || "");
      const marks = inline.marks || [];
      const markDefs = inline.markDefs || [];

      for (const mark of marks) {
        if (mark === "bold") text = `<strong>${text}</strong>`;
        else if (mark === "italic") text = `<em>${text}</em>`;
        else if (mark === "strike") text = `<del>${text}</del>`;
        else if (mark === "code") text = `<code class="prose-inline-code">${text}</code>`;
        else if (mark === "underline") text = `<u>${text}</u>`;
      }

      for (const def of markDefs) {
        if (def.type === "link") {
          const href = htmlEscaper.attr(def.attrs?.href || "#");
          const target = def.attrs?.target ? ` target="${htmlEscaper.attr(def.attrs.target)}"` : "";
          const rel = def.attrs?.rel ? ` rel="${htmlEscaper.attr(def.attrs.rel)}"` : "";
          const download = formatDownloadAttr(def.attrs?.download);
          text = `<a href="${href}"${target}${rel}${download} class="prose-link">${text}</a>`;
        }
      }

      return text;
    })
    .join("");
}

function renderBlockNodeSync(node: BlockNode, serverDataMap: Map<string, any>, ctx?: BlockRenderContext): string {
  const blockDef = getBlock(node.type);
  const data = serverDataMap.get(node.id);

  let childrenHtml = "";
  if (node.children && node.children.length > 0) {
    const isInlineOnly = node.children.every((c) => "type" in c && (c as any).type === "text");
    if (isInlineOnly) {
      childrenHtml = renderInlineSpans(node.children, serverDataMap, ctx);
    } else {
      childrenHtml = node.children
        .map((c) => {
          if ("type" in c && c.type !== "text") {
            return renderBlockNodeSync(c as BlockNode, serverDataMap, ctx);
          }
          return htmlEscaper.text((c as InlineSpan).text || "");
        })
        .join("\n");
    }
  }

  if (blockDef?.render) {
    return blockDef.render(node.props, rawHtml(childrenHtml), data, ctx, htmlEscaper);
  }

  // Fallback generic container
  return `<div class="block-${node.type}">${childrenHtml}</div>`;
}

/**
 * Traverses a block tree recursively to collect promises for loadServerData.
 *
 * Blocks render to static HTML, but a block may fetch dynamic data first
 * (e.g. RelatedPosts reading other articles through `ctx.articles`). Identical
 * requests within one document share a single fetch — no timeouts, a slow
 * store simply delays the render.
 */
async function loadAllServerData(
  nodes: BlockNode[],
  ctx: BlockRenderContext,
  map: Map<string, any>
): Promise<void> {
  const inFlight = new Map<string, Promise<any>>();
  const tasks: Promise<void>[] = [];

  const stableKey = (value: unknown): string => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableKey).join(",")}]`;
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, val]) => `${JSON.stringify(key)}:${stableKey(val)}`);
    return `{${entries.join(",")}}`;
  };

  function traverse(node: BlockNode) {
    const blockDef = getBlock(node.type);
    if (blockDef?.loadServerData) {
      const key = `${node.type}:${stableKey(node.props)}`;
      let pending = inFlight.get(key);
      if (!pending) {
        pending = blockDef.loadServerData(node.props, ctx);
        inFlight.set(key, pending);
      }
      tasks.push(
        pending.then((res) => {
          map.set(node.id, res);
        })
      );
    }
    if (node.children) {
      for (const child of node.children) {
        if ("type" in child && child.type !== "text") {
          traverse(child as BlockNode);
        }
      }
    }
  }

  nodes.forEach(traverse);
  await Promise.all(tasks);
}

/**
 * Collects all JSON-LD entities generated by blocks in the document.
 *
 * The document emits a single `@graph`: every block synthesizes its entities
 * from its own props (and fetched data), so no manual schema block is needed.
 * Entities without a string `@type` are dropped, and duplicate `@id`s keep
 * their first occurrence, keeping the graph valid.
 */
function collectJsonLdEntities(nodes: BlockNode[], map: Map<string, any>): any[] {
  const entities: any[] = [];
  const seenIds = new Set<string>();

  const pushEntity = (entity: any) => {
    if (!entity || typeof entity !== "object" || typeof entity["@type"] !== "string") return;
    if (typeof entity["@id"] === "string") {
      if (seenIds.has(entity["@id"])) return;
      seenIds.add(entity["@id"]);
    }
    entities.push(entity);
  };

  function traverse(node: BlockNode) {
    const blockDef = getBlock(node.type);
    if (blockDef?.generateJsonLd) {
      const data = map.get(node.id);
      const res = blockDef.generateJsonLd(node.props, data);
      if (res) {
        if (Array.isArray(res)) res.forEach(pushEntity);
        else pushEntity(res);
      }
    }
    if (node.children) {
      for (const child of node.children) {
        if ("type" in child && child.type !== "text") {
          traverse(child as BlockNode);
        }
      }
    }
  }

  nodes.forEach(traverse);
  return entities;
}

/**
 * High-performance, unified document renderer for both Live Draft Preview and Production.
 */
export async function renderDocument(
  content: string | BlockNode[],
  ctx: BlockRenderContext = {}
): Promise<RenderDocumentResult> {
  const blocks = typeof content === "string" ? parseDslToBlocks(content) : content;
  const serverDataMap = new Map<string, any>();

  // 1. Asynchronously load server-side data (e.g. RelatedPosts querying D1)
  await loadAllServerData(blocks, ctx, serverDataMap);

  // 2. Synthesize JSON-LD Schema entities
  const blockEntities = collectJsonLdEntities(blocks, serverDataMap);

  // Base BlogPosting entity
  const post = ctx.post;
  const blogPosting: any = {
    "@type": "BlogPosting",
    "@id": post?.slug ? `#article-${post.slug}` : "#article",
    headline: post?.title || "",
    author: {
      "@type": "Person",
      name: post?.author || "jeflopo",
    },
  };

  if (blockEntities.length > 0) {
    blogPosting.mentions = blockEntities
      .filter((e) => e["@id"])
      .map((e) => ({ "@id": e["@id"] }));
  }

  const jsonLd = {
    "@context": "https://schema.org" as const,
    "@graph": [blogPosting, ...blockEntities],
  };

  // 3. Render HTML blocks
  const htmlParts = blocks.map((b) => renderBlockNodeSync(b, serverDataMap, ctx));
  const html = htmlParts.join("\n\n");

  // 4. Collect CSS styles
  const styles = getCombinedBlockStyles();

  return {
    html,
    blocks,
    jsonLd,
    styles,
  };
}
