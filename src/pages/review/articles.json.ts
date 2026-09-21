export const prerender = true;

import type { APIRoute } from "astro";
import { createEnvironmentReadModel } from "../../lib/article";
import { createGitBundleSource } from "../../lib/article-sources/git-bundle";

/**
 * The Git side of the Article Store divergence check, as a build artifact.
 *
 * This is a route because `astro:content` resolves inside Astro's own module graph and
 * nowhere else: an integration hook, a config import and a standalone script all fail to
 * resolve it. And it is a *response* rather than a file write because the Cloudflare
 * adapter prerenders inside workerd, where the filesystem is not permitted.
 *
 * So the build emits `dist/review/articles.json` and CI collects it into `.review/` before
 * deploying — see `scripts/collect-article-snapshot.mjs`. It reads through the same
 * environment read model as the site, so the artifact can never be more revealing than the
 * pages already are: on a production build it holds published Articles only.
 */
export const GET: APIRoute = async () => {
  const articles = await createEnvironmentReadModel(createGitBundleSource()).listVisible();

  return new Response(
    `${JSON.stringify({ generatedAt: new Date().toISOString(), articles }, null, 2)}\n`,
    { headers: { "Content-Type": "application/json" } }
  );
};
