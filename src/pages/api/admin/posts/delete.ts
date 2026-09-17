export const prerender = false;

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../lib/db";

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

    const post = await db
      .prepare("SELECT slug FROM posts WHERE id = ?")
      .bind(id)
      .first<{ slug: string }>();

    const slug = post?.slug?.trim().toLowerCase();

    // 1. Delete associated assets and post record from D1
    if (slug) {
      await db.prepare("DELETE FROM assets WHERE post_slug = ?").bind(slug).run();
    }
    await db.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();

    let deletedFromGitHub = false;
    const githubPat = (env as any)?.GITHUB_PAT || (typeof process !== "undefined" ? process.env?.GITHUB_PAT : null);

    // 2. Synchronize deletion with GitHub if GITHUB_PAT is configured
    if (githubPat && slug) {
      const repo = "jeflopodev/blog-astro";
      const branch = "main";
      const targetDir = `src/content/blog/${slug}`;

      try {
        // Query bundle directory on GitHub
        const dirRes = await fetch(`https://api.github.com/repos/${repo}/contents/${targetDir}?ref=${branch}`, {
          headers: {
            Authorization: `Bearer ${githubPat}`,
            "User-Agent": "Astro-Blog-Admin",
            Accept: "application/vnd.github.v3+json",
          },
        });

        if (dirRes.ok) {
          const items = await dirRes.json();
          if (Array.isArray(items)) {
            for (const item of items) {
              if (item.type === "file" && item.sha) {
                await fetch(`https://api.github.com/repos/${repo}/contents/${item.path}`, {
                  method: "DELETE",
                  headers: {
                    Authorization: `Bearer ${githubPat}`,
                    "User-Agent": "Astro-Blog-Admin",
                    Accept: "application/vnd.github.v3+json",
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    message: `feat(blog): delete ${item.name} for "${slug}"`,
                    sha: item.sha,
                    branch,
                  }),
                });
              }
            }
            deletedFromGitHub = true;
          }
        } else {
          // Check for legacy flat files (e.g. .mdx or .md)
          for (const ext of [".mdx", ".md"]) {
            const filePath = `src/content/blog/${slug}${ext}`;
            const fileRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`, {
              headers: {
                Authorization: `Bearer ${githubPat}`,
                "User-Agent": "Astro-Blog-Admin",
                Accept: "application/vnd.github.v3+json",
              },
            });
            if (fileRes.ok) {
              const fileData = (await fileRes.json()) as any;
              if (fileData?.sha) {
                await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
                  method: "DELETE",
                  headers: {
                    Authorization: `Bearer ${githubPat}`,
                    "User-Agent": "Astro-Blog-Admin",
                    Accept: "application/vnd.github.v3+json",
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    message: `feat(blog): delete post ${slug}${ext}`,
                    sha: fileData.sha,
                    branch,
                  }),
                });
                deletedFromGitHub = true;
              }
            }
          }
        }
      } catch (ghErr) {
        console.warn("GitHub deletion warning:", ghErr);
      }
    }

    // 3. Local filesystem removal fallback when running locally in Node
    if (typeof process !== "undefined" && process.versions?.node && slug) {
      try {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const baseDir = path.resolve(process.cwd(), "src", "content", "blog");
        const bundleDir = path.resolve(baseDir, slug);

        if (bundleDir.startsWith(baseDir) && bundleDir !== baseDir && fs.existsSync(bundleDir)) {
          fs.rmSync(bundleDir, { recursive: true, force: true });
        }

        for (const ext of [".mdx", ".md"]) {
          const flatFile = path.resolve(baseDir, `${slug}${ext}`);
          if (flatFile.startsWith(baseDir) && fs.existsSync(flatFile)) {
            fs.unlinkSync(flatFile);
          }
        }
      } catch (localErr) {
        console.warn("Local filesystem delete error:", localErr);
      }
    }

    return new Response(JSON.stringify({ success: true, deletedFromGitHub }), {
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
