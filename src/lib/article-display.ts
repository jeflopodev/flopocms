import {
  toTemplateProps,
  type Article,
  type ArticleReadModel,
  type ArticleTemplateProps,
  type TemplateId,
} from "./article";
import type { BlockRenderContext } from "../blocks/types";

/**
 * Article Display.
 *
 * What one Article becomes when it is rendered as a page: the name it is given, the Post
 * Template it uses, the props that template reads, and the context the Document Renderer
 * hands to every block. It is decided here instead of at each surface, because the two
 * surfaces that render an Article already drifted once — a published page and a Live Draft
 * Preview of the same Article must differ by their mode and nothing else.
 *
 * The `mode` is the whole difference: `published` is the page a reader opens, `preview` is
 * the Editor looking at an Article that may not exist for anyone else yet.
 */

export type DisplayMode = "published" | "preview";

export interface ArticleDisplayPlan {
  /** The page's own name. A preview marks it, so two open tabs are told apart. */
  title: string;
  description: string;
  template: TemplateId;
  templateProps: ArticleTemplateProps;
  /** Everything a Block can read about the Article it is inside. */
  blockContext: BlockRenderContext;
}

export function articleDisplayPlan(
  article: Article,
  mode: DisplayMode,
  articles: ArticleReadModel
): ArticleDisplayPlan {
  return {
    title: mode === "preview" ? `[Preview] ${article.title}` : article.title,
    description: article.description,
    template: article.template,
    templateProps: {
      ...toTemplateProps(article),
      // A preview always says so, even of an Article that is already published: the banner is
      // the preview's warning about where you are, not a claim about the Article's status.
      draft: mode === "preview" || article.status === "draft",
    },
    blockContext: {
      articles,
      post: {
        // The slug is the Article's identity, which is why a preview and a published page
        // emit the same JSON-LD `@id` for the same Article.
        id: article.slug,
        slug: article.slug,
        title: article.title,
        author: article.author,
        category: article.category,
      },
      isDraftPreview: mode === "preview",
    },
  };
}
