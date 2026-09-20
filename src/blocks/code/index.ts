import * as v from "valibot";
import type { BlockDefinition } from "../types";

export const codeBlockSchema = v.object({
  lang: v.optional(v.string(), "typescript"),
  title: v.optional(v.string()),
  code: v.optional(v.string()),
});

export type CodeBlockProps = v.InferOutput<typeof codeBlockSchema>;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export const codeBlock: BlockDefinition<CodeBlockProps> = {
  type: "code",
  tagName: "CodeBlock",
  label: "Code Block",
  category: "text",
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  schema: codeBlockSchema,
  defaultProps: { lang: "typescript" },
  snippet: `<CodeBlock lang="typescript" title="example.ts">\n  const greeting = "Hello, world!";\n  console.log(greeting);\n</CodeBlock>`,
  render: (props, childrenHtml) => {
    const rawContent = props.code || childrenHtml || "";
    // Clean child HTML tags if any were rendered
    const textContent = rawContent.replace(/<[^>]+>/g, "");
    const escaped = escapeHtml(textContent.trim());
    const headerHtml = props.title
      ? `<div class="code-block-header"><span class="code-block-title">${escapeHtml(props.title)}</span><span class="code-block-lang">${props.lang || ""}</span></div>`
      : "";

    return `<div class="code-block-wrapper">
      ${headerHtml}
      <pre class="prose-pre" data-lang="${props.lang || ""}"><code class="language-${props.lang || ""}">${escaped}</code></pre>
    </div>`;
  },
  styles: `
    .code-block-wrapper {
      margin: 1.75rem 0;
      border-radius: 8px;
      overflow: hidden;
      background: #0f172a;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }
    .code-block-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 1rem;
      background: #1e293b;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      font-size: 0.8rem;
      color: #94a3b8;
    }
    .code-block-title {
      font-family: var(--font-mono, monospace);
      font-weight: 600;
      color: #f1f5f9;
    }
    .code-block-lang {
      text-transform: uppercase;
      font-size: 0.7rem;
      letter-spacing: 0.05em;
    }
    .prose-pre {
      margin: 0;
      padding: 1.25rem 1.5rem;
      overflow-x: auto;
      font-family: var(--font-mono, monospace);
      font-size: 0.9rem;
      line-height: 1.6;
      color: #e2e8f0;
      background: transparent;
    }
    .prose-pre code {
      font-family: inherit;
      background: none;
      padding: 0;
      color: inherit;
    }
  `,
};
