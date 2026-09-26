export const prerender = false;

import { adminRoute } from "../../../lib/admin-route";

/**
 * Who the `admin_session` cookie belongs to, if anyone.
 *
 * The public site chrome is statically prerendered, so the header cannot read
 * `Astro.locals.user` there — the middleware never runs for those responses.
 * Instead the header fetches this route at runtime: 200 means show the Admin
 * and Sign Out links, 401 means keep them hidden. Authentication itself stays
 * in the middleware, which answers 401 before this handler runs.
 */
export const GET = adminRoute(async ({ user }) => {
  return {
    success: true,
    authenticated: true,
    user,
  };
});
