export const prerender = false;

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { eq, and, ne } from "drizzle-orm";
import { getDb, posts } from "../../../../lib/db";
import { getLockStatus } from "../../../../lib/locks";
import {
  ensureBranch,
  commitPostFile,
  ensurePullRequest,
  mergePullRequest,
  deleteBranch,
} from "../../../../lib/git-publisher";

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
  default_width?: string;
  wide_width?: string;
  pub_date?: string;
}

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
    const body = (await request.json()) as SavePostPayload;

    const {
      id,
      slug,
      title,
      description = "",
      category = "General",
      tags = "[]",
      author = user.username || "jeflopo",
      featured_image = "",
      content_mdx = "",
      status = "draft",
      template = "default",
      default_width = "60rem",
      wide_width = "70rem",
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

    // Verify post lock to avoid concurrency collision
    const lockStatus = await getLockStatus(db, id, user.id);
    if (lockStatus.locked) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Cannot save: Post is currently locked by @${lockStatus.lock?.username || "another editor"}.`,
        }),
        { status: 423, headers: { "Content-Type": "application/json" } }
      );
    }

    const tagsStr = Array.isArray(tags) ? JSON.stringify(tags) : tags;
    const now = new Date().toISOString();
    const effectivePubDate = pub_date || now;
    const isDraft = status === "draft";

    // 1. Check uniqueness of slug across other posts
    const [existing] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, id))
      .limit(1);

    if (existing) {
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
    }

    // 2. Build standard-compliant frontmatter & MDX body
    const today = effectivePubDate.split("T")[0];
    const safeTitle = title.replace(/'/g, "''").replace(/[\r\n]+/g, " ").trim();
    const safeDesc = description.replace(/'/g, "''").replace(/[\r\n]+/g, " ").trim();
    const heroLine = featured_image ? `heroImage: '${featured_image.replace(/'/g, "''")}'\n` : "";
    const templateLine = `template: '${template || "default"}'\n`;
    const defaultWidthLine = `defaultWidth: '${default_width || "60rem"}'\n`;
    const wideWidthLine = `wideWidth: '${wide_width || "70rem"}'\n`;

    const mdxContent = `---
title: '${safeTitle}'
description: '${safeDesc}'
pubDate: '${today}'
${heroLine}${templateLine}${defaultWidthLine}${wideWidthLine}author: '${author}'
draft: ${isDraft}
---

${content_mdx || ""}
`;

    // 3. Git-Sync Publisher (isolated branch per post & automated PR / merge)
    const githubPat = (env as any)?.GITHUB_PAT || (typeof process !== "undefined" ? process.env?.GITHUB_PAT : null);
    const repo = "jeflopodev/blog-astro";
    const branch = `content/${cleanSlug}`;
    const targetPath = `src/content/blog/${cleanSlug}/index.mdx`;

    let gitResult = {
      committed: false,
      prNumber: existing?.prNumber ?? null,
      prUrl: existing?.prUrl ?? null,
      merged: false,
      message: "",
    };

    if (githubPat) {
      const gitConfig = { pat: githubPat, repo };

      // Ensure branch exists
      const branchRes = await ensureBranch(gitConfig, branch, "main");
      if (!branchRes.success) {
        console.warn("Branch creation warning:", branchRes.error);
      }

      if (isDraft) {
        // DRAFT FLOW: Commit to branch & ensure open PR
        const commitRes = await commitPostFile(
          gitConfig,
          branch,
          targetPath,
          mdxContent,
          `chore(content): draft update for "${title}" by @${author}`
        );

        if (commitRes.success) {
          gitResult.committed = true;
          const prRes = await ensurePullRequest(
            gitConfig,
            branch,
            "main",
            `[Draft] ${title}`,
            `Automated editorial draft for article \`${cleanSlug}\` authored by @${author}.\n\nMerged automatically upon publishing.`
          );
          if (prRes.success) {
            gitResult.prNumber = prRes.prNumber ?? null;
            gitResult.prUrl = prRes.prUrl ?? null;
          }
          gitResult.message = "Draft saved to D1 & committed to branch " + branch;
        } else {
          console.error("Git draft commit error:", commitRes.error);
        }
      } else {
        // PUBLISHED FLOW: Final commit to branch, ensure PR, auto-merge to main, delete branch
        const commitRes = await commitPostFile(
          gitConfig,
          branch,
          targetPath,
          mdxContent,
          `feat(blog): publish "${title}" by @${author}`
        );

        if (commitRes.success) {
          gitResult.committed = true;
          // Ensure PR exists
          let prNum = gitResult.prNumber;
          if (!prNum) {
            const prRes = await ensurePullRequest(
              gitConfig,
              branch,
              "main",
              `[Publish] ${title}`,
              `Publication PR for article \`${cleanSlug}\` by @${author}.`
            );
            if (prRes.success && prRes.prNumber) {
              prNum = prRes.prNumber;
              gitResult.prNumber = prNum;
              gitResult.prUrl = prRes.prUrl ?? null;
            }
          }

          if (prNum) {
            const mergeRes = await mergePullRequest(
              gitConfig,
              prNum,
              `feat(blog): publish "${title}" (#${prNum})`,
              "squash"
            );
            if (mergeRes.success) {
              gitResult.merged = true;
              await deleteBranch(gitConfig, branch);
              gitResult.message = "Published! PR merged to main and branch cleaned up.";
            } else {
              console.error("Auto-merge error:", mergeRes.error);
              gitResult.message = `Committed to ${branch}, but auto-merge failed: ${mergeRes.error}`;
            }
          }
        } else {
          console.error("Git publish commit error:", commitRes.error);
        }
      }
    }

    // 4. Local filesystem write fallback when running locally in Node
    if (typeof process !== "undefined" && process.versions?.node) {
      try {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const baseDir = path.resolve(process.cwd(), "src", "content", "blog");
        const targetDir = path.resolve(baseDir, cleanSlug);

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

    // 5. Update or insert record in Cloudflare D1
    const postRecord = {
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
      defaultWidth: default_width,
      wideWidth: wide_width,
      pubDate: effectivePubDate,
      gitBranch: isDraft ? branch : null,
      prNumber: gitResult.prNumber,
      prUrl: gitResult.prUrl,
      updatedAt: now,
    };

    if (existing) {
      await db.update(posts).set(postRecord).where(eq(posts.id, id));
    } else {
      await db.insert(posts).values({
        id,
        createdAt: now,
        ...postRecord,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        id,
        slug: cleanSlug,
        status,
        gitBranch: isDraft ? branch : null,
        prNumber: gitResult.prNumber,
        prUrl: gitResult.prUrl,
        committedToGitHub: gitResult.committed,
        merged: gitResult.merged,
        message: gitResult.message || "Saved successfully!",
        updated_at: now,
      }),
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
