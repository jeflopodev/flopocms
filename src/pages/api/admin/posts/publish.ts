export const prerender = false;

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
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

    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, id))
      .limit(1);

    if (!post) {
      return new Response(JSON.stringify({ success: false, error: "Post not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const slug = post.slug?.trim().toLowerCase();
    const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!slug || !SLUG_REGEX.test(slug)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid post slug format. Must be alphanumeric with hyphens." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const today = new Date().toISOString().split("T")[0];
    const pubDate = post.pubDate ? post.pubDate.split("T")[0] : today;

    // Safely escape single quotes and strip newlines in YAML string attributes
    const safeTitle = (post.title || "").replace(/'/g, "''").replace(/[\r\n]+/g, " ").trim();
    const safeDesc = (post.description || "").replace(/'/g, "''").replace(/[\r\n]+/g, " ").trim();
    const heroLine = post.featuredImage ? `heroImage: '${post.featuredImage.replace(/'/g, "''")}'\n` : "";
    const templateLine = `template: '${post.template || "default"}'\n`;

    const mdxContent = `---
title: '${safeTitle}'
description: '${safeDesc}'
pubDate: '${pubDate}'
${heroLine}${templateLine}author: '${post.author || "jeflopo"}'
draft: false
---

${post.contentMdx || ""}
`;

    const githubPat = (env as any)?.GITHUB_PAT || (typeof process !== "undefined" ? process.env?.GITHUB_PAT : null);

    let committedToGitHub = false;

    // 1. Commit to GitHub if GITHUB_PAT available
    if (githubPat) {
      const repo = "jeflopodev/blog-astro";
      const branch = "main";
      const targetPath = `src/content/blog/${slug}/index.mdx`;

      let sha: string | undefined;
      try {
        const checkRes = await fetch(`https://api.github.com/repos/${repo}/contents/${targetPath}?ref=${branch}`, {
          headers: {
            Authorization: `Bearer ${githubPat}`,
            "User-Agent": "Astro-Blog-Admin",
            Accept: "application/vnd.github.v3+json",
          },
        });
        if (checkRes.ok) {
          const checkData = (await checkRes.json()) as any;
          sha = checkData.sha;
        }
      } catch (err) {
        console.warn("GitHub check sha warning:", err);
      }

      const base64Content = Buffer.from(mdxContent, "utf-8").toString("base64");
      const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${targetPath}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${githubPat}`,
          "User-Agent": "Astro-Blog-Admin",
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `feat(blog): publish "${post.title}" by @${post.author || "jeflopo"}`,
          content: base64Content,
          branch,
          ...(sha ? { sha } : {}),
        }),
      });

      if (putRes.ok) {
        committedToGitHub = true;
      } else {
        const putError = await putRes.text();
        console.error("GitHub publish error:", putError);
      }
    }

    // 2. Local filesystem write fallback when running locally in Node
    if (typeof process !== "undefined" && process.versions?.node) {
      try {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const baseDir = path.resolve(process.cwd(), "src", "content", "blog");
        const targetDir = path.resolve(baseDir, slug);

        if (targetDir.startsWith(baseDir) && targetDir !== baseDir) {
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          const filePath = path.join(targetDir, "index.mdx");
          fs.writeFileSync(filePath, mdxContent, "utf-8");
        }
      } catch (localErr) {
        console.warn("Local filesystem write error:", localErr);
      }
    }

    // 3. Mark as published in D1 via Drizzle ORM
    const now = new Date().toISOString();
    await db
      .update(posts)
      .set({
        status: "published",
        updatedAt: now,
      })
      .where(eq(posts.id, id));

    return new Response(
      JSON.stringify({
        success: true,
        committedToGitHub,
        slug,
        status: "published",
        message: committedToGitHub
          ? "Published and committed to GitHub main!"
          : "Saved to D1 and local files. Set GITHUB_PAT secret for remote git commits.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Publish post error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Failed to publish post" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
