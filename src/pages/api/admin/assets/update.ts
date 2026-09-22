export const prerender = false;

import { adminRoute, readJson } from "../../../../lib/admin-route";

interface UpdateAssetPayload {
  id?: string;
  title?: string;
  altText?: string;
  description?: string;
}

export const POST = adminRoute(async ({ request, services }) => {
  const raw = await readJson(request);
  if (!raw.ok) return { success: false, status: 400, error: raw.error };

  const { id, title = "", altText = "", description = "" } = raw.value as UpdateAssetPayload;
  if (!id) return { success: false, status: 400, error: "Asset ID is required" };

  const result = await services.assets.updateMetadata({ id, title, altText, description });
  if (!result.success) return { success: false, status: 400, error: result.error };

  return { success: true, message: "Asset metadata updated successfully" };
});
