export const prerender = false;

import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, posts } from "../../../../lib/db";

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

    const [original] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, id))
      .limit(1);

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

    await db.insert(posts).values({
      id: newId,
      slug: newSlug,
      title: newTitle,
      description: original.description,
      category: original.category,
      tags: original.tags,
      author: original.author,
      featuredImage: original.featuredImage,
      contentMdx: original.contentMdx,
      status: "draft",
      template: original.template,
      pubDate: now,
      createdAt: now,
      updatedAt: now,
    });

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
