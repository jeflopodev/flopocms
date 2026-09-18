export const prerender = false;

import type { APIRoute } from "astro";
import { eq, and, ne } from "drizzle-orm";
import { getDb, posts } from "../../../../lib/db";

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
  template?: "default" | "two-column";
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
      template = "default",
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
    const [existing] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.id, id))
      .limit(1);

    if (existing) {
      // Check slug uniqueness across OTHER posts
      const [slugConflict] = await db
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.slug, cleanSlug), ne(posts.id, id)))
        .limit(1);

      if (slugConflict) {
        return new Response(
          JSON.stringify({ success: false, error: `Slug "${cleanSlug}" is already used by another post.` }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        );
      }

      await db
        .update(posts)
        .set({
          slug: cleanSlug,
          title,
          description,
          category,
          tags: tagsStr,
          author,
          featuredImage: featured_image,
          contentMdx: content_mdx,
          status,
          template,
          pubDate: effectivePubDate,
          updatedAt: now,
        })
        .where(eq(posts.id, id));
    } else {
      await db.insert(posts).values({
        id,
        slug: cleanSlug,
        title,
        description,
        category,
        tags: tagsStr,
        author,
        featuredImage: featured_image,
        contentMdx: content_mdx,
        status,
        template,
        pubDate: effectivePubDate,
        createdAt: now,
        updatedAt: now,
      });
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
