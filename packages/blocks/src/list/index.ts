import { CARET } from "../marks";
import type { ToolbarAction } from "../toolbar";
import type { BlockDefinition } from "../types";
import { listSchema, type ListProps } from "./schema";

export * from "./schema";

export const listBlock: BlockDefinition<ListProps> = {
  type: "list",
  tagName: "List",
  label: "List",
  category: "text",
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  schema: listSchema,
  defaultProps: { type: "unordered" },
  drawer: {
    description: "Nested list with custom list-style-type",
    preview: '<List type="unordered">...</List>',
    insertLabel: "Complex List",
    order: 2,
  },
  snippet: `<List type="unordered">\n  <ListItem>\n    <Paragraph>First key takeaway</Paragraph>\n  </ListItem>\n  <ListItem>\n    <Paragraph>Second key takeaway</Paragraph>\n  </ListItem>\n</List>`,
  toolbar: [
    {
      id: "bullet",
      title: "Bullet List",
      bodyHtml: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
      snippet: `\n<List type="unordered">\n  <ListItem>\n    <Paragraph>${CARET}First point</Paragraph>\n  </ListItem>\n</List>\n`,
      group: "lists",
      order: 130,
    },
    {
      id: "numbered",
      title: "Numbered List",
      bodyHtml: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/></svg>`,
      snippet: `\n<List type="ordered">\n  <ListItem>\n    <Paragraph>${CARET}Step 1</Paragraph>\n  </ListItem>\n</List>\n`,
      group: "lists",
      order: 140,
    },
  ] satisfies ToolbarAction[],
  render: (props, childrenHtml, _data, _ctx, h) => {
    const isOrdered = props.type === "ordered";
    const tag = isOrdered ? "ol" : "ul";
    const startAttr = props.start && isOrdered ? ` start="${h.attr(props.start)}"` : "";
    const styleAttr = props.listStyle ? ` style="list-style-type: ${h.attr(props.listStyle)};"` : "";

    return `<${tag} class="prose-list prose-${tag}"${startAttr}${styleAttr}>${childrenHtml}</${tag}>`;
  },
  styles: `
    .prose-list {
      margin: 1.25rem 0;
      padding-left: 1.5rem;
    }
    .prose-ul { list-style-type: disc; }
    .prose-ol { list-style-type: decimal; }
  `,
};
