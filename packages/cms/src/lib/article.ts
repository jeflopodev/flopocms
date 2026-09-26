/**
 * Article Read Model.
 *
 * One place through which an Article is read, whether it is a Draft held in
 * Cloudflare D1 or a published bundle on `main`. Callers say which Article they
 * want; the adapter behind the seam knows which store holds the bytes.
 *
 * The visibility rule lives here rather than in the callers, so no preview page or
 * related-articles module can accidentally render a Draft into production.
 */

export type ArticleStatus = "draft" | "published";

export type TemplateId = "default" | "two-column";

/**
 * A hero image reference, and the one place the two cases are told apart.
 *
 * A published bundle carries an image the build imported, so its measurements are known
 * and a Post Template can optimize it. The editorial record carries a URL from the Asset
 * Registry, which nothing can measure, so the template renders it as it is. The union is
 * deliberate: an `{ src }` that pretended both were interchangeable is what let a Draft's
 * URL reach `<Image>`.
 */
export interface BundledHeroImage {
  src: string;
  width: number;
  height: number;
  /** Astro's input formats, written out so this module imports nothing from astro. */
  format: "jpeg" | "jpg" | "png" | "apng" | "tiff" | "webp" | "gif" | "svg" | "avif";
}

export type HeroImage = string | BundledHeroImage;

export interface Article {
  /** Stable identity of the Article. Also the URL segment on production. */
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  author: string;
  category: string;
  tags: string[];
  /** ISO timestamp. */
  pubDate: string;
  updatedAt?: string;
  heroImage?: HeroImage;
  template: TemplateId;
  defaultWidth: string;
  wideWidth: string;
  status: ArticleStatus;
  /** Article body in the JSX Block DSL, ready for the Document Renderer. */
  content: string;
}

/**
 * Where Articles are held. Adapters return everything they have and make no
 * judgement about visibility — that belongs to the read model, not the store.
 */
export interface ArticleSource {
  list(): Promise<Article[]>;
  /**
   * Loads one Article by identifier. For a Git bundle the identifier is the slug;
   * for the editorial record it may also be the post id.
   */
  load(identifier: string): Promise<Article | null>;
}

/**
 * Whether a hero image is a bundle asset the build measured, rather than an editorial URL.
 *
 * The distinction lives here, as a rule with tests, because a Post Template is a `.astro`
 * file and nothing in this project type-checks one: TypeScript 7 does not expose the API
 * `astro check` needs, and `tsc` does not read `.astro`. The template can only ask.
 */
export function isBundledHeroImage(
  heroImage: HeroImage | undefined
): heroImage is BundledHeroImage {
  return typeof heroImage === "object" && heroImage !== null;
}

export interface ArticleVisibility {
  /** Drafts are visible in local development and on preview deployments. */
  includeDrafts: boolean;
}

export interface RelatedOptions {
  category?: string;
  excludeSlug?: string;
  limit?: number;
}

export interface ArticleReadModel {
  /** Public read. Returns null for a Draft when drafts are not visible here. */
  loadVisible(identifier: string): Promise<Article | null>;
  /** Public listing, newest first. */
  listVisible(): Promise<Article[]>;
  /** Published Articles only, regardless of deployment. Never includes the current one. */
  listRelated(options?: RelatedOptions): Promise<Article[]>;
}

const DEFAULT_LIMIT = 3;

function byPubDateDesc(a: Article, b: Article): number {
  return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
}

export function createArticleReadModel(
  source: ArticleSource,
  visibility: ArticleVisibility = { includeDrafts: false }
): ArticleReadModel {
  const isVisible = (article: Article) => visibility.includeDrafts || article.status === "published";

  return {
    async loadVisible(identifier) {
      if (!identifier) return null;
      const article = await source.load(identifier);
      if (!article || !isVisible(article)) return null;
      return article;
    },

    async listVisible() {
      const all = await source.list();
      return all.filter(isVisible).sort(byPubDateDesc);
    },

    async listRelated(options = {}) {
      const { category, excludeSlug, limit = DEFAULT_LIMIT } = options;
      const all = await source.list();

      return all
        .filter((article) => article.status === "published")
        .filter((article) => !excludeSlug || article.slug !== excludeSlug)
        .filter((article) => !category || article.category === category)
        .sort(byPubDateDesc)
        .slice(0, limit);
    },
  };
}

export interface ArticleTemplateProps {
  title: string;
  description: string;
  pubDate: Date;
  updatedDate?: Date;
  heroImage?: HeroImage;
  draft: boolean;
  author: string;
  defaultWidth: string;
  wideWidth: string;
}

/**
 * Whether Drafts are visible in this environment: local development and non-main branch
 * previews yes, production no. It lives with the read model because it is the visibility
 * rule the read model applies, and callers used to fetch it and pass it back in.
 */
export function isDraftVisible(): boolean {
  if (import.meta.env?.DEV) {
    return true;
  }

  if (process.env.ENVIRONMENT === "production" || process.env.NODE_ENV === "production") {
    return false;
  }

  const branch =
    process.env.GITHUB_REF_NAME || process.env.CF_PAGES_BRANCH || process.env.BRANCH || "";

  if (
    branch === "main" ||
    branch === "master" ||
    branch === "production" ||
    branch.startsWith("main/")
  ) {
    return false;
  }

  // A dedicated preview branch sees Drafts; an ambiguous environment does not.
  return Boolean(branch);
}

/** The read model as this build's environment should see it. */
export function createEnvironmentReadModel(source: ArticleSource): ArticleReadModel {
  return createArticleReadModel(source, { includeDrafts: isDraftVisible() });
}

/**
 * The single mapping from an Article to what a Post Template renders. Production and
 * Live Draft Preview cross this same function, which is what keeps their markup identical.
 */
export function toTemplateProps(article: Article): ArticleTemplateProps {
  return {
    title: article.title,
    description: article.description,
    pubDate: new Date(article.pubDate),
    updatedDate: article.updatedAt ? new Date(article.updatedAt) : undefined,
    heroImage: article.heroImage,
    draft: article.status === "draft",
    author: article.author,
    defaultWidth: article.defaultWidth,
    wideWidth: article.wideWidth,
  };
}

export interface ArticleDivergence {
  slug: string;
  kind: "missing-from-d1" | "missing-from-main" | "content-differs" | "status-differs";
  detail: string;
}

/**
 * Projector invariant: the Published View must match `main`. Kept as a property test
 * over the projector (project-then-project equals project), not as a dashboard report.
 */
export function diffArticleStores(main: Article[], d1: Article[]): ArticleDivergence[] {
  const mainBySlug = new Map(main.map((article) => [article.slug, article]));
  const d1BySlug = new Map(d1.map((article) => [article.slug, article]));
  const divergences: ArticleDivergence[] = [];

  for (const [slug, row] of d1BySlug) {
    if (row.status !== "published") continue;
    const bundle = mainBySlug.get(slug);
    if (!bundle) {
      divergences.push({
        slug,
        kind: "missing-from-main",
        detail: "D1 reports this Article as published, but main has no bundle for it.",
      });
      continue;
    }
    if (bundle.content.trim() !== row.content.trim()) {
      divergences.push({
        slug,
        kind: "content-differs",
        detail: "The published bundle on main and the D1 projection disagree on content.",
      });
    }
  }

  for (const slug of mainBySlug.keys()) {
    if (!d1BySlug.has(slug)) {
      divergences.push({
        slug,
        kind: "missing-from-d1",
        detail: "main has a bundle that the D1 projection does not know about.",
      });
    }
  }

  for (const [slug, bundle] of mainBySlug) {
    const row = d1BySlug.get(slug);
    if (row && row.status !== bundle.status && row.status === "draft") {
      divergences.push({
        slug,
        kind: "status-differs",
        detail: "The bundle is published on main while D1 still holds it as a Draft.",
      });
    }
  }

  return divergences.sort((a, b) => a.slug.localeCompare(b.slug));
}
