export const prerender = false;

import { adminRoute, readJson } from "#/lib/admin-route";

/**
 * The lock's three verbs in one file still, but no longer three copies of the same
 * envelope: acquiring, renewing and releasing differ only in which Lock Store verb they
 * call.
 */

/**
 * The Concurrency Lock's TTL, in seconds.
 *
 * A heartbeat well inside it keeps the lock alive; a closed tab lets it lapse, so the other
 * Editor is never permanently shut out.
 */
const TTL_SECONDS = 45;

interface LockRequestBody {
  postId?: string;
  action?: "acquire" | "renew" | "release";
}

/**
 * Where a lock request names its Article.
 *
 * `fetch` puts it in the query string; `sendBeacon`, which cannot set a content type,
 * puts it in the body — so both are read before the request is refused.
 */
async function lockRequest(
  request: Request,
  url: URL
): Promise<{ postId: string | null; action: "acquire" | "renew" | "release" }> {
  let postId = url.searchParams.get("postId");
  let action: string | null = url.searchParams.get("action");

  if ((!postId || !action) && request.headers.get("content-type")?.includes("application/json")) {
    const raw = await readJson(request);
    if (raw.ok) {
      const body = raw.value as LockRequestBody;
      if (body?.postId) postId = body.postId;
      if (body?.action) action = body.action;
    }
  }

  return {
    postId,
    action: action === "renew" || action === "release" ? action : "acquire",
  };
}

export const GET = adminRoute(async ({ url, user, services }) => {
  const postId = url.searchParams.get("postId");
  if (!postId) return { status: 400, error: "Missing postId" };

  return services.locks.status(postId, user.id);
});

export const POST = adminRoute(async ({ request, url, user, services }) => {
  const { postId, action } = await lockRequest(request, url);
  if (!postId) return { status: 400, error: "Missing postId" };

  if (action === "release") {
    await services.locks.release(postId, user.id);
    return { success: true, released: true };
  }

  if (action === "renew") {
    await services.locks.renew(postId, user.id, TTL_SECONDS);
    return { success: true, renewed: true };
  }

  const result = await services.locks.acquire(postId, { id: user.id, username: user.username }, TTL_SECONDS);

  // 423 Locked: another Editor holds it, so the session keeps the unsaved work.
  return { ...result, status: result.locked ? 423 : 200 };
});

export const DELETE = adminRoute(async ({ request, url, user, services }) => {
  const { postId } = await lockRequest(request, url);
  if (!postId) return { status: 400, error: "Missing postId" };

  await services.locks.release(postId, user.id);

  return { success: true, released: true };
});
