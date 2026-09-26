export const prerender = false;

import { adminRoute, readJson } from "../../../../lib/admin-route";
import { deletePostLifecycle } from "../../../../lib/post-lifecycle";

export const POST = adminRoute(async ({ request, services }) => {
  const raw = await readJson(request);
  if (!raw.ok) return { success: false, status: 400, error: raw.error };

  const { id } = raw.value as { id?: string };
  if (!id) return { success: false, status: 400, error: "Missing post ID" };

  const result = await deletePostLifecycle({ id, services });
  if (!result.success) {
    return {
      success: false,
      status: result.status ?? 400,
      error: result.error || "Failed to delete post",
    };
  }

  return { success: true, deletedFromGitHub: result.deletedFromGitHub };
});
