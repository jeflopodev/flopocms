import type { BlockDefinition, BlockRenderContext } from "#/types";
import { relatedPostsSchema, type RelatedPostsProps } from "./schema";

export * from "./schema";

export interface RelatedPostItem {
  slug: string;
  title: string;
  category: string;
  description?: string;
}

export const relatedPostsBlock: BlockDefinition<RelatedPostsProps, RelatedPostItem[]> = {
  type: "related-posts",
  tagName: "RelatedPosts",
  label: "Related Articles",
  category: "embed",
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  schema: relatedPostsSchema,
  defaultProps: { limit: 3, title: "Related Articles" },
  drawer: {
    description: "Other published Articles, read by category",
    preview: '<RelatedPosts category="Astro" limit={3} />',
    insertLabel: "Related Posts",
    order: 5,
  },
  snippet: `<RelatedPosts category="General" limit={3} />`,
  loadServerData: async (props, ctx: BlockRenderContext) => {
    // Reads go through the Article Read Model, never a direct query against a store.
    const articles = ctx.articles;
    if (!articles) return [];

    const related = await articles.listRelated({
      category: props.category || ctx.post?.category,
      excludeSlug: props.currentSlug || ctx.post?.slug,
      limit: Number(props.limit) || 3,
    });

    return related.map((article) => ({
      slug: article.slug,
      title: article.title,
      category: article.category,
      description: article.excerpt || article.description,
    }));
  },
  render: (props, _childrenHtml, data, ctx, h) => {
    const list = data || [];
    const title = props.title || "Related Articles";

    if (list.length === 0) {
      if (ctx?.isDraftPreview) {
        return `<div class="related-preview-empty">
          <div class="related-header">
            <span class="related-title">${h.text(title)}</span>
          </div>
          <p class="related-empty-note">No published related articles found for category "${h.text(props.category || "General")}". (Placeholder shown in preview)</p>
        </div>`;
      }
      return "";
    }

    const cardsHtml = list
      .map(
        (item) => `<a href="/blog/${h.attr(item.slug)}" class="related-card">
          <span class="related-category">${h.text(item.category || "General")}</span>
          <h4 class="related-card-title">${h.text(item.title)}</h4>
          ${item.description ? `<p class="related-card-desc">${h.text(item.description)}</p>` : ""}
        </a>`
      )
      .join("");

    return `<section class="related-posts-block" aria-label="${h.attr(title)}">
      <div class="related-header">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        <h3 class="related-title">${h.text(title)}</h3>
      </div>
      <div class="related-grid">
        ${cardsHtml}
      </div>
    </section>`;
  },
  styles: `
    .related-posts-block {
      margin: 2.5rem 0;
      padding: 1.5rem;
      border-radius: var(--radius-lg, 12px);
      background: var(--bg-surface, #ffffff);
      border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
      box-sizing: border-box;
      width: 100%;
    }
    .related-preview-empty {
      padding: 1rem 1.25rem;
      background: rgba(99, 102, 241, 0.05);
      border: 1px dashed rgba(99, 102, 241, 0.3);
      border-radius: 8px;
      margin: 1.5rem 0;
    }
    .related-empty-note {
      font-size: 0.85rem;
      color: var(--text-muted, #64748b);
      margin: 0.25rem 0 0;
    }
    .related-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1.25rem;
      color: var(--primary, #3b82f6);
    }
    .related-title {
      margin: 0;
      font-size: 1.2rem;
      font-weight: 700;
      color: var(--text-heading, #0f172a);
    }
    .related-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
    }
    .related-card {
      display: flex;
      flex-direction: column;
      padding: 1rem;
      border-radius: 8px;
      background: var(--bg-surface-elevated, #f8fafc);
      border: 1px solid var(--border-subtle, #e2e8f0);
      text-decoration: none;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .related-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
    }
    .related-category {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--primary, #3b82f6);
      margin-bottom: 0.4rem;
    }
    .related-card-title {
      margin: 0 0 0.4rem;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-heading, #0f172a);
      line-height: 1.4;
    }
    .related-card-desc {
      margin: 0;
      font-size: 0.82rem;
      color: var(--text-secondary, #64748b);
      line-height: 1.5;
    }
  `,
};
