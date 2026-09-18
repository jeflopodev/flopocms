export const prerender = false;

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb, assets } from "../../../../lib/db";

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const db = getDb(locals);
    const body = (await request.json()) as { id?: string };
    const { id } = body;

    if (!id) {
      return new Response(JSON.stringify({ success: false, error: "Missing asset ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const [assetRecord] = await db
      .select()
      .from(assets)
      .where(eq(assets.id, id))
      .limit(1);

    if (!assetRecord) {
      return new Response(JSON.stringify({ success: false, error: "Asset not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const filename = assetRecord.filename;

    // 1. Delete from D1 via Drizzle
    await db.delete(assets).where(eq(assets.id, id));

    // 2. Local filesystem cleanup
    if (typeof process !== "undefined" && process.versions?.node) {
      try {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const filePath = path.resolve(process.cwd(), "public", "uploads", filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (localErr) {
        console.warn("Local file deletion warning:", localErr);
      }
    }

    // 3. GitHub repository cleanup if configured
    const githubPat = (env as any)?.GITHUB_PAT || (typeof process !== "undefined" ? process.env?.GITHUB_PAT : null);
    if (githubPat) {
      const repo = "jeflopodev/blog-astro";
      const branch = "main";
      const targetPath = `public/uploads/${filename}`;

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
          if (checkData?.sha) {
            await fetch(`https://api.github.com/repos/${repo}/contents/${targetPath}`, {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${githubPat}`,
                "User-Agent": "Astro-Blog-Admin",
                Accept: "application/vnd.github.v3+json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                message: `media(global): delete ${filename}`,
                sha: checkData.sha,
                branch,
              }),
            });
          }
        }
      } catch (ghErr) {
        console.warn("GitHub asset deletion warning:", ghErr);
      }
    }

    return new Response(JSON.stringify({ success: true, message: "Asset deleted successfully" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Delete asset error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Failed to delete asset" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
