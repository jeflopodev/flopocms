import type { BlockDefinition } from "../types";
import { schemaBlockSchema, type SchemaBlockProps } from "./schema";

export * from "./schema";

export const schemaBlock: BlockDefinition<SchemaBlockProps> = {
  type: "schema",
  tagName: "Schema",
  label: "Custom Schema (JSON-LD)",
  category: "meta",
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
  schema: schemaBlockSchema,
  snippet: `<Schema type="FAQPage" data={{\n  "@type": "FAQPage",\n  "mainEntity": [\n    {\n      "@type": "Question",\n      "name": "Question title?",\n      "acceptedAnswer": {\n        "@type": "Answer",\n        "text": "Answer text."\n      }\n    }\n  ]\n}} />`,
  generateJsonLd: (props) => {
    if (!props.type) return null;
    return {
      "@type": props.type,
      ...(props.data || {}),
    };
  },
  render: (props, _childrenHtml, _data, ctx) => {
    if (ctx?.isDraftPreview) {
      return `<div class="schema-preview-badge">
        <strong>&lt;Schema type="${props.type}" /&gt;</strong> (Attached to document JSON-LD graph)
      </div>`;
    }
    return `<!-- <Schema type="${props.type}" /> -->`;
  },
  styles: `
    .schema-preview-badge {
      display: inline-block;
      padding: 0.35rem 0.75rem;
      border-radius: 4px;
      background: rgba(14, 165, 233, 0.08);
      border: 1px dashed #0ea5e9;
      font-size: 0.78rem;
      color: #0284c7;
      margin: 0.5rem 0;
    }
  `,
};
