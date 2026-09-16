import { getCollection, type CollectionEntry } from "astro:content";

/**
 * Determines whether draft articles should be rendered in the current build environment.
 * Drafts are visible in local development and on non-main Cloudflare branch preview deployments.
 * Drafts are omitted on the production domain (main branch).
 */
export function isDraftVisible(): boolean {
  // If explicitly flagged as production, hide drafts
  if (process.env.ENVIRONMENT === "production") {
    return false;
  }

  // Cloudflare Pages / Workers branch deployment check
  const branch = process.env.CF_PAGES_BRANCH || process.env.BRANCH;
  if (branch === "main" || branch === "master" || branch === "production") {
    return false;
  }

  // Allow drafts in dev or preview branches
  return true;
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
