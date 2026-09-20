import * as v from "valibot";
import type { BlockDefinition } from "../types";

export const imageBlockSchema = v.object({
  src: v.string(),
  alt: v.optional(v.string(), ""),
  caption: v.optional(v.string()),
  stretch: v.optional(v.string(), "default"),
});

export type ImageBlockProps = v.InferOutput<typeof imageBlockSchema>;

export const imageBlock: BlockDefinition<ImageBlockProps> = {
  type: "image",
  tagName: "Image",
  label: "Image",
  category: "media",
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  schema: imageBlockSchema,
  supportsStretch: true,
  defaultProps: { stretch: "default" },
  snippet: `<Image src="/uploads/image.webp" alt="Description" caption="Optional caption" stretch="default" />`,
  render: (props) => {
    const stretch = props.stretch || "default";
    const captionHtml = props.caption ? `<figcaption class="prose-figcaption">${props.caption}</figcaption>` : "";

    return `<figure class="prose-figure" data-stretch="${stretch}">
      <img src="${props.src}" alt="${props.alt || ""}" class="prose-img" loading="lazy" />
      ${captionHtml}
    </figure>`;
  },
  styles: `
    .prose-figure {
      margin: 2rem 0;
      width: 100%;
      box-sizing: border-box;
      text-align: center;
    }
    .prose-img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
      display: inline-block;
    }
    .prose-figcaption {
      margin-top: 0.5rem;
      font-size: 0.85rem;
      color: var(--text-muted, #64748b);
      font-style: italic;
    }
  `,
};
