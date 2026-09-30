export const prerender = false;

import { adminRoute } from "#/lib/admin-route";

/** Signs the Editor out everywhere: every session ends, including this one. */
export const POST = adminRoute(async ({ user, services, cookies }) => {
  const ended = await services.accounts.endAllSessions(user.id);
  cookies.delete("admin_session", { path: "/" });

  return {
    success: true,
    signedOut: true,
    message: ended === 1 ? "Signed out everywhere." : `Signed out of ${ended} sessions.`,
  };
});
