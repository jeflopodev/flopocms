export const prerender = false;

import { adminRoute, readJson } from "#/lib/admin-route";

/**
 * Ends one session, named by the identity Profile & Security lists.
 *
 * The Editor is passed in rather than trusted from the body, so one Editor cannot end
 * another's session by guessing an id.
 */
export const POST = adminRoute(async ({ request, user, services, cookies }) => {
  const raw = await readJson(request);
  if (!raw.ok) return { success: false, status: 400, error: raw.error };

  const { sessionId } = raw.value as { sessionId?: string };
  if (!sessionId) return { success: false, status: 400, error: "A session id is required." };

  const ended = await services.accounts.endSession({
    editorId: user.id,
    sessionId,
    currentToken: cookies.get("admin_session")?.value,
  });

  if (!ended.ended) {
    return { success: false, status: 404, error: "That session is no longer open." };
  }

  // Ending the session you are looking at is a sign-out, and the cookie goes with it.
  if (ended.endedCurrent) cookies.delete("admin_session", { path: "/" });

  return {
    success: true,
    signedOut: ended.endedCurrent,
    message: ended.endedCurrent ? "Signed out on this device." : "Session ended.",
  };
});
