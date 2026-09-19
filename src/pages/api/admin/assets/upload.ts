export const prerender = false;

import type { APIRoute } from "astro";
import { getDb } from "../../../../lib/db";
import { getMediaStorage } from "../../../../lib/media-storage";
import { registerAsset } from "../../../../lib/asset-registry";

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return new Response(
        JSON.stringify({ success: false, error: "No file uploaded" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const db = getDb(locals);
    const storage = getMediaStorage(locals);

    const result = await registerAsset({ file, db, storage });

    if (!result.success || !result.asset) {
      return new Response(
        JSON.stringify({ success: false, error: result.error || "Failed to upload asset" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        assetId: result.asset.id,
        filename: result.asset.filename,
        url: result.asset.url,
        mimeType: result.asset.mimeType,
        byteSize: result.asset.byteSize,
        snippet: result.snippet,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Upload asset error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Failed to upload asset" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
