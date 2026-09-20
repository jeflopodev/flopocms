import type { BlockNode, InlineSpan } from "../types";
import { getBlock } from "../registry";

function formatAttrValue(val: any): string {
  if (typeof val === "string") {
    return `"${val.replace(/"/g, '\\"')}"`;
  }
  if (typeof val === "number" || typeof val === "boolean") {
    return `{${val}}`;
  }
  return `{${JSON.stringify(val)}}`;
}

function serializeAttrs(props: Record<string, any>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (value === true) {
      parts.push(key);
    } else {
      parts.push(`${key}=${formatAttrValue(value)}`);
    }
  }
  return parts.length > 0 ? " " + parts.join(" ") : "";
}

function serializeInlineSpans(spans: (BlockNode | InlineSpan)[]): string {
  return spans
    .map((span) => {
      if ("type" in span && span.type !== "text") {
        return serializeBlockNode(span as BlockNode, 0);
      }
      const inline = span as InlineSpan;
      let text = inline.text;
      if (!text) return "";

      const marks = inline.marks || [];
      const markDefs = inline.markDefs || [];

      // Wrap in mark tags
      for (const mark of marks) {
        if (mark === "bold") text = `<Bold>${text}</Bold>`;
        else if (mark === "italic") text = `<Italic>${text}</Italic>`;
        else if (mark === "strike") text = `<Strike>${text}</Strike>`;
        else if (mark === "code") text = `<Code>${text}</Code>`;
        else if (mark === "underline") text = `<Underline>${text}</Underline>`;
      }

      for (const def of markDefs) {
        if (def.type === "link") {
          const href = def.attrs?.href || "#";
          text = `<Link href="${href}">${text}</Link>`;
        }
      }

      return text;
    })
    .join("");
}

export function serializeBlockNode(node: BlockNode, indent = 0): string {
  const blockDef = getBlock(node.type);
  const tagName = blockDef?.tagName || node.type.charAt(0).toUpperCase() + node.type.slice(1);
  const spaces = " ".repeat(indent);
  const attrsStr = serializeAttrs(node.props || {});

  if (!node.children || node.children.length === 0) {
    return `${spaces}<${tagName}${attrsStr} />`;
  }

  // Check if children are only text spans
  const isInlineOnly = node.children.every((c) => "type" in c && (c as any).type === "text");
  if (isInlineOnly) {
    const inlineContent = serializeInlineSpans(node.children);
    return `${spaces}<${tagName}${attrsStr}>\n${spaces}  ${inlineContent.trim()}\n${spaces}</${tagName}>`;
  }

  // Nested block children
  const childrenStr = node.children
    .map((child) => {
      if ("type" in child && child.type !== "text") {
        return serializeBlockNode(child as BlockNode, indent + 2);
      }
      return `${spaces}  ${(child as InlineSpan).text}`;
    })
    .join("\n");

  return `${spaces}<${tagName}${attrsStr}>\n${childrenStr}\n${spaces}</${tagName}>`;
}

/**
 * Serializes an array of BlockNode objects into formatted JSX DSL content.
 */
export function serializeBlocksToDsl(blocks: BlockNode[]): string {
  return blocks.map((b) => serializeBlockNode(b, 0)).join("\n\n");
}
