import * as v from "valibot";
import { CARET } from "../marks";
import type { ToolbarAction } from "../toolbar";
import type { BlockDefinition } from "../types";

export const headingSchema = v.object({
  level: v.optional(
    v.pipe(
      v.union([v.number(), v.string()]),
      v.transform((val) => Number(val))
    ),
    2
  ),
  id: v.optional(v.string()),
});

export type HeadingProps = v.InferOutput<typeof headingSchema>;

export const headingBlock: BlockDefinition<HeadingProps> = {
  type: "heading",
  tagName: "Heading",
  label: "Heading",
  category: "text",
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 12h12M6 4v16M18 4v16"/></svg>`,
  schema: headingSchema,
  defaultProps: { level: 2 },
  snippet: `<Heading level={2}>Section Title</Heading>`,
  toolbar: [1, 2, 3, 4, 5, 6].map(
    (level): ToolbarAction => ({
      id: `h${level}`,
      title: `Heading ${level}`,
      bodyHtml: `H${level}`,
      snippet: `\n<Heading level={${level}}>${CARET}Heading Title</Heading>\n`,
      group: "headings",
      order: 30 + level * 10,
    })
  ),
  render: (props, childrenHtml) => {
    const level = Math.min(6, Math.max(1, props.level || 2));
    const tag = `h${level}`;
    const idAttr = props.id ? ` id="${props.id}"` : "";
    return `<${tag} class="prose-heading prose-h${level}"${idAttr}>${childrenHtml}</${tag}>`;
  },
  styles: `
    .prose-heading {
      font-weight: 700;
      color: var(--text-heading, #0f172a);
      letter-spacing: -0.02em;
    }
    .prose-h1 { font-size: 2.25rem; margin: 2.5rem 0 1.25rem; line-height: 1.2; }
    .prose-h2 { font-size: 1.75rem; margin: 2.25rem 0 1rem; line-height: 1.25; }
    .prose-h3 { font-size: 1.35rem; margin: 1.75rem 0 0.85rem; line-height: 1.3; }
    .prose-h4 { font-size: 1.15rem; margin: 1.5rem 0 0.75rem; }
    .prose-h5 { font-size: 1rem; margin: 1.25rem 0 0.5rem; }
    .prose-h6 { font-size: 0.875rem; margin: 1.25rem 0 0.5rem; text-transform: uppercase; letter-spacing: 0.05em; }
  `,
};
