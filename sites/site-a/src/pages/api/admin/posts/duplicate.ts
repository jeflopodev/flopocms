export const prerender = false;

import { adminRoute, readJson } from "cms/lib/admin-route";
import { duplicatePostLifecycle } from "cms/lib/post-lifecycle";

export const POST = adminRoute(async ({ request, services }) => {
  const raw = await readJson(request);
  if (!raw.ok) return { success: false, status: 400, error: raw.error };

  const { id } = raw.value as { id?: string };
  if (!id) return { success: false, status: 400, error: "Missing post ID" };

  const result = await duplicatePostLifecycle({ id, services });
  if (!result.success) {
    return {
      success: false,
      status: result.error === "Post not found" ? 404 : 400,
      error: result.error || "Failed to duplicate post",
    };
  }

  return { success: true, newId: result.newId };
});

