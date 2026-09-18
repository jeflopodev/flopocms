export const prerender = false;

import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, assets } from "../../../../lib/db";

interface UpdateAssetPayload {
  id?: string;
  title?: string;
  altText?: string;
  description?: string;
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const db = getDb(locals);
    const body = (await request.json()) as UpdateAssetPayload;
    const { id, title = "", altText = "", description = "" } = body;

    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: "Asset ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const now = new Date().toISOString();

    await db
      .update(assets)
      .set({
        title,
        altText,
        description,
        updatedAt: now,
      })
      .where(eq(assets.id, id));

    return new Response(
      JSON.stringify({ success: true, message: "Asset metadata updated successfully" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Update asset error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Failed to update asset" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
