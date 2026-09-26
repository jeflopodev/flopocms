import type { BlockDefinition } from "../types";
import { calloutSchema, type CalloutProps } from "./schema";

export * from "./schema";

const defaultTitles: Record<string, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};

const icons: Record<string, string> = {
  note: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  tip: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  important: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  caution: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

export const calloutBlock: BlockDefinition<CalloutProps> = {
  type: "callout",
  tagName: "Callout",
  label: "Callout Alert",
  category: "text",
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  schema: calloutSchema,
  supportsStretch: true,
  defaultProps: { variant: "note", stretch: "default" },
  drawer: {
    description: "Accessible alert callouts",
    preview: '<Callout variant="note">...</Callout>',
    insertLabel: "Callout",
    order: 1,
  },
  insertions: Object.keys(defaultTitles).map((variant) => ({
    label: defaultTitles[variant],
    snippet: `<Callout variant="${variant}">\n  <Paragraph>Enter callout explanation here.</Paragraph>\n</Callout>`,
  })),
  snippet: `<Callout variant="note">\n  <Paragraph>Enter callout explanation here.</Paragraph>\n</Callout>`,
  render: (props, childrenHtml, _data, _ctx, h) => {
    const variant = props.variant || "note";
    const title = props.title || defaultTitles[variant] || "Note";
    const stretch = props.stretch || "default";
    const icon = icons[variant] || icons.note;
    const customClass = props.class ? ` ${h.attr(props.class)}` : "";

    return `<aside class="callout-box callout-${h.attr(variant)}${customClass}" data-stretch="${h.attr(stretch)}" role="note">
      <div class="callout-header">
        <div class="callout-icon" aria-hidden="true">${icon}</div>
        <span class="callout-title">${h.text(title)}</span>
      </div>
      <div class="callout-content">
        ${childrenHtml}
      </div>
    </aside>`;
  },
  styles: `
    .callout-box {
      margin: 1.75rem 0;
      padding: 1.15rem 1.4rem;
      border-radius: var(--radius-md, 8px);
      border-left: 4px solid var(--primary, #3b82f6);
      background: var(--bg-surface, #ffffff);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      font-size: 0.96rem;
      line-height: 1.6;
      box-sizing: border-box;
      width: 100%;
    }
    .callout-header {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-weight: 700;
      margin-bottom: 0.6rem;
      font-size: 0.95rem;
      letter-spacing: 0.01em;
    }
    .callout-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .callout-title {
      font-weight: 700;
    }
    .callout-content {
      font-size: 0.95rem;
      line-height: 1.65;
    }
    .callout-content p {
      margin: 0.5rem 0;
    }
    .callout-content p:first-child {
      margin-top: 0;
    }
    .callout-content p:last-child {
      margin-bottom: 0;
    }
    .callout-note {
      border-left-color: #3b82f6;
      background: rgba(59, 130, 246, 0.06);
    }
    .callout-note .callout-header { color: #2563eb; }
    .callout-tip {
      border-left-color: #10b981;
      background: rgba(16, 185, 129, 0.06);
    }
    .callout-tip .callout-header { color: #059669; }
    .callout-important {
      border-left-color: #8b5cf6;
      background: rgba(139, 92, 246, 0.06);
    }
    .callout-important .callout-header { color: #7c3aed; }
    .callout-warning {
      border-left-color: #f59e0b;
      background: rgba(245, 158, 11, 0.08);
    }
    .callout-warning .callout-header { color: #d97706; }
    .callout-caution {
      border-left-color: #ef4444;
      background: rgba(239, 68, 68, 0.07);
    }
    .callout-caution .callout-header { color: #dc2626; }
  `,
};
