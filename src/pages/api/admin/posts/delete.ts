export const prerender = false;

import type { APIRoute } from "astro";
import { getDb } from "../../../../lib/db";
import { deletePostLifecycle } from "../../../../lib/post-lifecycle";

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb(locals);
    const body = (await request.json()) as { id?: string };
    const { id } = body;

    if (!id) {
      return new Response(JSON.stringify({ success: false, error: "Missing post ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await deletePostLifecycle({ id, db, locals });

    if (!result.success) {
      return new Response(JSON.stringify({ success: false, error: result.error || "Failed to delete post" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, deletedFromGitHub: result.deletedFromGitHub }), {
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
