import type { BlockDefinition } from "../types";
import { listItemSchema, type ListItemProps } from "./schema";

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
