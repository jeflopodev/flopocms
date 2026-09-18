export const prerender = false;

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getDb, assets } from "../../../../lib/db";

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2 MB for images
const MAX_NON_IMAGE_SIZE = 25 * 1024 * 1024; // 25 MB for media, video, archives, documents

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return new Response(
        JSON.stringify({ success: false, error: "No file uploaded" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const isImage = file.type.startsWith("image/");
    const maxAllowedSize = isImage ? MAX_IMAGE_SIZE : MAX_NON_IMAGE_SIZE;
    const maxAllowedLabel = isImage ? "2 MB" : "25 MB";

    if (file.size > maxAllowedSize) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the ${maxAllowedLabel} limit.`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Clean filename
    const originalName = file.name || "upload.bin";
    const extension = originalName.includes(".")
      ? "." + originalName.split(".").pop()?.toLowerCase()
      : "";
    const baseName = originalName
      .replace(/\.[^/.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80);

    const cleanFilename = `${baseName}${extension}`;
    const url = `/uploads/${cleanFilename}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Content = buffer.toString("base64");

    const githubPat = (env as any)?.GITHUB_PAT || (typeof process !== "undefined" ? process.env?.GITHUB_PAT : null);

    // 1. Commit to GitHub if GITHUB_PAT configured (production Workers)
    if (githubPat) {
      const targetPath = `public/uploads/${cleanFilename}`;
      const repo = "jeflopodev/blog-astro";
      const branch = "main";

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
        console.warn("GitHub check file warning:", err);
      }

      const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${targetPath}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${githubPat}`,
          "User-Agent": "Astro-Blog-Admin",
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `media(global): upload ${cleanFilename} [skip ci]`,
          content: base64Content,
          branch,
          ...(sha ? { sha } : {}),
        }),
      });

      if (!putRes.ok) {
        const putError = await putRes.text();
        console.error("GitHub global upload error:", putError);
      }
    }

    // 2. Local filesystem write fallback when running locally in Node
    if (typeof process !== "undefined" && process.versions?.node) {
      try {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const uploadsDir = path.resolve(process.cwd(), "public", "uploads");

        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const filePath = path.join(uploadsDir, cleanFilename);
        fs.writeFileSync(filePath, buffer);
      } catch (localErr) {
        console.warn("Local filesystem write error:", localErr);
      }
    }

    // 3. Register in D1 global assets table via Drizzle ORM
    const db = getDb(locals);
    const assetId = crypto.randomUUID();
    const now = new Date().toISOString();
    const fallbackTitle = baseName.replace(/-/g, " ");

    await db.insert(assets).values({
      id: assetId,
      filename: cleanFilename,
      originalName,
      mimeType: file.type || "application/octet-stream",
      byteSize: file.size,
      url,
      title: fallbackTitle,
      altText: fallbackTitle,
      description: "",
      createdAt: now,
      updatedAt: now,
    });

    const snippet = isImage
      ? `![${fallbackTitle}](${url})`
      : `<a href="${url}" download="${originalName}">${originalName}</a>`;

    return new Response(
      JSON.stringify({
        success: true,
        assetId,
        filename: cleanFilename,
        url,
        mimeType: file.type,
        byteSize: file.size,
        snippet,
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
