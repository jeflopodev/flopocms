import type { BlockDefinition } from "../types";
import { listSchema, listItemSchema, type ListProps, type ListItemProps } from "./schema";

export * from "./schema";

export const listItemBlock: BlockDefinition<ListItemProps> = {
  type: "list-item",
  tagName: "ListItem",
  label: "List Item",
  category: "text",
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="4" cy="12" r="2"/><line x1="9" y1="12" x2="20" y2="12"/></svg>`,
  schema: listItemSchema,
  snippet: `<ListItem>\n  <Paragraph>Item text</Paragraph>\n</ListItem>`,
  render: (_props, childrenHtml) => {
    return `<li class="prose-li">${childrenHtml}</li>`;
  },
  styles: `
    .prose-li {
      margin: 0.35rem 0;
      line-height: 1.65;
    }
  `,
};

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
  render: (props, childrenHtml) => {
    const isOrdered = props.type === "ordered";
    const tag = isOrdered ? "ol" : "ul";
    const startAttr = props.start && isOrdered ? ` start="${props.start}"` : "";
    const styleAttr = props.listStyle ? ` style="list-style-type: ${props.listStyle};"` : "";

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
