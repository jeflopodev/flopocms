import { getCollection, type CollectionEntry } from "astro:content";

/**
 * Determines whether draft articles should be rendered in the current build environment.
 * Drafts are visible in local development and on non-main Cloudflare branch preview deployments.
 * Drafts are omitted on the production domain (main branch).
 */
export function isDraftVisible(): boolean {
  // Always visible during local dev server
  if (import.meta.env.DEV) {
    return true;
  }

  // If explicitly flagged as production, hide drafts
  if (
    process.env.ENVIRONMENT === "production" ||
    process.env.NODE_ENV === "production"
  ) {
    return false;
  }

  // Check branch in CI/CD (GitHub Actions, Cloudflare, etc.)
  const branch =
    process.env.GITHUB_REF_NAME ||
    process.env.CF_PAGES_BRANCH ||
    process.env.BRANCH ||
    "";

  if (
    branch === "main" ||
    branch === "master" ||
    branch === "production" ||
    branch.startsWith("main/")
  ) {
    return false;
  }

  // If running on a dedicated preview branch (e.g. preview/* or editor branch PR)
  if (branch && branch !== "main" && branch !== "master") {
    return true;
  }

  // Default to safe behavior (hide drafts in any ambiguous or non-dev build)
  return false;
}

/**
 * Returns all blog articles visible in the current environment, sorted by pubDate descending.
 */
export async function getVisibleBlogArticles(): Promise<CollectionEntry<"blog">[]> {
  const allowDrafts = isDraftVisible();
  const allPosts = await getCollection("blog");

  return allPosts
    .filter((post) => allowDrafts || !post.data.draft)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}
