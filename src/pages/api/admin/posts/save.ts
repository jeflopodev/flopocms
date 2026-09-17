export const prerender = false;

import type { APIRoute } from "astro";
import { getDb, type PostRow } from "../../../../lib/db";

interface SavePostPayload {
  id?: string;
  slug?: string;
  title?: string;
  description?: string;
  category?: string;
  tags?: string[] | string;
  author?: string;
  featured_image?: string;
  content_mdx?: string;
  status?: "draft" | "published";
  pub_date?: string;
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const db = getDb(locals);
    const body = (await request.json()) as SavePostPayload;

    const {
      id,
      slug,
      title,
      description = "",
      category = "General",
      tags = "[]",
      author = "jeflopo",
      featured_image = "",
      content_mdx = "",
      status = "draft",
      pub_date,
    } = body;

    if (!id || !slug || !title) {
      return new Response(
        JSON.stringify({ success: false, error: "ID, slug, and title are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const cleanSlug = slug.trim().toLowerCase();
    const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!SLUG_REGEX.test(cleanSlug)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid post slug format. Must be lowercase alphanumeric with hyphens." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const tagsStr = Array.isArray(tags) ? JSON.stringify(tags) : tags;
    const now = new Date().toISOString();
    const effectivePubDate = pub_date || now;

    // Check if post exists
    const existing = await db
      .prepare("SELECT id FROM posts WHERE id = ?")
      .bind(id)
      .first<PostRow>();

    if (existing) {
      // Check slug uniqueness across OTHER posts
      const slugConflict = await db
        .prepare("SELECT id FROM posts WHERE slug = ? AND id != ?")
        .bind(cleanSlug, id)
        .first<PostRow>();

      if (slugConflict) {
        return new Response(
          JSON.stringify({ success: false, error: `Slug "${cleanSlug}" is already used by another post.` }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        );
      }

      await db
        .prepare(
          `UPDATE posts SET
            slug = ?,
            title = ?,
            description = ?,
            category = ?,
            tags = ?,
            author = ?,
            featured_image = ?,
            content_mdx = ?,
            status = ?,
            pub_date = ?,
            updated_at = ?
           WHERE id = ?`
        )
        .bind(
          cleanSlug,
          title,
          description,
          category,
          tagsStr,
          author,
          featured_image,
          content_mdx,
          status,
          effectivePubDate,
          now,
          id
        )
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO posts (id, slug, title, description, category, tags, author, featured_image, content_mdx, status, pub_date, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          cleanSlug,
          title,
          description,
          category,
          tagsStr,
          author,
          featured_image,
          content_mdx,
          status,
          effectivePubDate,
          now,
          now
        )
        .run();
    }

    return new Response(
      JSON.stringify({ success: true, updated_at: now }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Save post error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Failed to save post" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
