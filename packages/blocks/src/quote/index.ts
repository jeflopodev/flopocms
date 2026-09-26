import * as v from "valibot";
import { CARET } from "../marks";
import type { ToolbarAction } from "../toolbar";
import type { BlockDefinition } from "../types";

export const quoteSchema = v.object({
  cite: v.optional(v.string()),
  author: v.optional(v.string()),
});

export type QuoteProps = v.InferOutput<typeof quoteSchema>;

export const quoteBlock: BlockDefinition<QuoteProps> = {
  type: "quote",
  tagName: "Quote",
  label: "Blockquote",
  category: "text",
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/></svg>`,
  schema: quoteSchema,
  snippet: `<Quote author="Author Name">\n  <Paragraph>Quote text goes here.</Paragraph>\n</Quote>`,
  toolbar: [
    {
      id: "quote",
      title: "Quote",
      bodyHtml: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/></svg>`,
      snippet: `\n<Quote>\n  <Paragraph>${CARET}Quote text</Paragraph>\n</Quote>\n`,
      group: "insert",
      order: 110,
    } satisfies ToolbarAction,
  ],
  render: (props, childrenHtml, _data, _ctx, h) => {
    const citeAttr = props.cite ? ` cite="${h.attr(props.cite)}"` : "";
    const authorHtml = props.author ? `<footer class="quote-author">&mdash; ${h.text(props.author)}</footer>` : "";

    return `<blockquote class="prose-quote"${citeAttr}>
      ${childrenHtml}
      ${authorHtml}
    </blockquote>`;
  },
  styles: `
    .prose-quote {
      margin: 1.75rem 0;
      padding: 0.75rem 1.25rem;
      border-left: 4px solid var(--primary, #38bdf8);
      background: rgba(56, 189, 248, 0.04);
      border-radius: 0 var(--radius-sm, 6px) var(--radius-sm, 6px) 0;
      font-style: italic;
      color: var(--text-secondary, #475569);
    }
    .quote-author {
      font-style: normal;
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-primary, #1e293b);
      margin-top: 0.5rem;
    }
  `,
};
