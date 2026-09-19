export const prerender = false;

import type { APIRoute } from "astro";
import { getDb } from "../../../../lib/db";
import { savePostLifecycle, type SavePostPayload } from "../../../../lib/post-lifecycle";

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
    const payload = (await request.json()) as SavePostPayload;

    const result = await savePostLifecycle({ payload, user, db, locals });

    return new Response(JSON.stringify(result), {
      status: result.status || (result.success ? 200 : 400),
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Save post error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Failed to save post" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
