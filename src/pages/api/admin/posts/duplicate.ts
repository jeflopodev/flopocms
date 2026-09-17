export const prerender = false;

import type { APIRoute } from "astro";
import { getDb, type PostRow } from "../../../../lib/db";

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const db = getDb(locals);
    const body = (await request.json()) as { id?: string };
    const { id } = body;

    if (!id) {
      return new Response(JSON.stringify({ success: false, error: "Missing post ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const original = await db
      .prepare("SELECT * FROM posts WHERE id = ?")
      .bind(id)
      .first<PostRow>();

    if (!original) {
      return new Response(JSON.stringify({ success: false, error: "Post not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const newId = crypto.randomUUID();
    const suffix = Math.random().toString(36).substring(2, 6);
    const newSlug = `${original.slug}-copy-${suffix}`;
    const newTitle = `${original.title} (Copy)`;
    const now = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO posts (id, slug, title, description, category, tags, author, featured_image, content_mdx, status, pub_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`
      )
      .bind(
        newId,
        newSlug,
        newTitle,
        original.description,
        original.category,
        original.tags,
        original.author,
        original.featured_image,
        original.content_mdx,
        now,
        now,
        now
      )
      .run();

    return new Response(JSON.stringify({ success: true, newId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Duplicate post error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Failed to duplicate post" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
