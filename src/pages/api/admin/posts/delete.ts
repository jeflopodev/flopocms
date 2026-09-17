export const prerender = false;

import type { APIRoute } from "astro";
import { getDb } from "../../../../lib/db";

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const db = getDb(locals);
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return new Response(JSON.stringify({ success: false, error: "Missing post ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await db.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Delete post error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Failed to delete post" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
