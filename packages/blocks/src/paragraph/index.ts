import * as v from "valibot";
import type { BlockDefinition } from "#/types";

export const paragraphSchema = v.object({});

export type ParagraphProps = v.InferOutput<typeof paragraphSchema>;

export const paragraphBlock: BlockDefinition<ParagraphProps> = {
  type: "paragraph",
  tagName: "Paragraph",
  label: "Text Paragraph",
  category: "text",
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13M13 4v16M17 4v16"/></svg>`,
  schema: paragraphSchema,
  snippet: `<Paragraph>\n  Enter text here with <Bold>bold</Bold> or <Link href="#">link</Link>.\n</Paragraph>`,
  render: (_props, childrenHtml) => {
    return `<p class="prose-p">${childrenHtml}</p>`;
  },
  styles: `
    .prose-p {
      margin: 1.25rem 0;
      line-height: 1.75;
      color: var(--text-primary, #1e293b);
    }
  `,
};
