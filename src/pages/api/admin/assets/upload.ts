export const prerender = false;

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../lib/db";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB limit

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const slug = (formData.get("slug") as string)?.trim();

    if (!file || !slug) {
      return new Response(
        JSON.stringify({ success: false, error: "File and post slug are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds 2 MB limit.`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Clean filename
    const originalName = file.name || "image.png";
    const cleanFilename = originalName
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "-")
      .replace(/-+/g, "-");

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Content = buffer.toString("base64");

    const githubPat = (env as any)?.GITHUB_PAT || (typeof process !== "undefined" ? process.env?.GITHUB_PAT : null);

    let githubUrl = "";

    // 1. Commit to GitHub if GITHUB_PAT configured
    if (githubPat) {
      const targetPath = `src/content/blog/${slug}/${cleanFilename}`;
      const repo = "jeflopodev/blog-astro";
      const branch = "main";

      // Check if file already exists on GitHub to get SHA for update
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
          const checkData = await checkRes.json() as any;
          sha = checkData.sha;
        }
      } catch (err) {
        console.warn("GitHub check file warning:", err);
      }

      // Put content to GitHub
      const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${targetPath}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${githubPat}`,
          "User-Agent": "Astro-Blog-Admin",
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `media(blog): add ${cleanFilename} to ${slug} [skip ci]`,
          content: base64Content,
          branch,
          ...(sha ? { sha } : {}),
        }),
      });

      if (!putRes.ok) {
        const putError = await putRes.text();
        console.error("GitHub upload error:", putError);
      } else {
        githubUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${targetPath}`;
      }
    }

    // 2. Local filesystem write fallback when running locally in Node
    if (typeof process !== "undefined" && process.versions?.node) {
      try {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const targetDir = path.join(process.cwd(), "src", "content", "blog", slug);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        const filePath = path.join(targetDir, cleanFilename);
        fs.writeFileSync(filePath, buffer);
      } catch (localErr) {
        console.warn("Local filesystem write error:", localErr);
      }
    }

    // 3. Register in D1 assets table
    const db = getDb(locals);
    const assetId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO assets (id, post_slug, filename, mime_type, byte_size, github_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(assetId, slug, cleanFilename, file.type, file.size, githubUrl, now)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        assetId,
        filename: cleanFilename,
        githubUrl,
        snippet: `![${cleanFilename}](./${cleanFilename})`,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Upload asset error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Failed to upload asset" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
