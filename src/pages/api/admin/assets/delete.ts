export const prerender = false;

import { adminRoute, readJson } from "../../../../lib/admin-route";

export const POST = adminRoute(async ({ request, services }) => {
  const raw = await readJson(request);
  if (!raw.ok) return { success: false, status: 400, error: raw.error };

  const { id } = raw.value as { id?: string };
  if (!id) return { success: false, status: 400, error: "Missing asset ID" };

  const result = await services.assets.delete(id);
  if (!result.success) {
    return { success: false, status: 404, error: result.error || "Asset not found" };
  }

  return { success: true, message: "Asset deleted successfully" };
});
