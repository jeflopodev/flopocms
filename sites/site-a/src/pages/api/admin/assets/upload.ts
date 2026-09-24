export const prerender = false;

import { adminRoute } from "cms/lib/admin-route";

export const POST = adminRoute(async ({ request, services }) => {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) return { success: false, status: 400, error: "No file uploaded" };

  const result = await services.assets.upload(file);

  if (!result.success || !result.asset) {
    return { success: false, status: 400, error: result.error || "Failed to upload asset" };
  }

  // The created record, not insertion text: the caller builds that with
  // `insertionForAsset`, which is the one owner of the DSL spelling.
  return {
    success: true,
    assetId: result.asset.id,
    filename: result.asset.filename,
    originalName: result.asset.originalName,
    url: result.asset.url,
    mimeType: result.asset.mimeType,
    byteSize: result.asset.byteSize,
    title: result.asset.title,
    altText: result.asset.altText,
  };
});
