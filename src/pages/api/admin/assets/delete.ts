export const prerender = false;

import type { APIRoute } from "astro";
import { getDb } from "../../../../lib/db";
import { getMediaStorage } from "../../../../lib/media-storage";
import { deleteAsset } from "../../../../lib/asset-registry";

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const db = getDb(locals);
    const body = (await request.json()) as { id?: string };
    const { id } = body;

    if (!id) {
      return new Response(JSON.stringify({ success: false, error: "Missing asset ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const storage = getMediaStorage(locals);
    const result = await deleteAsset({ id, db, storage });

    if (!result.success) {
      return new Response(JSON.stringify({ success: false, error: result.error || "Asset not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, message: "Asset deleted successfully" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Delete asset error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Failed to delete asset" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
