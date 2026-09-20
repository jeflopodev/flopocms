import { eq, and, ne } from "drizzle-orm";
import type { DbClient } from "./db";
import { posts } from "./db";
import { getGithubPat } from "./env";
import { getLockStatus } from "./locks";
import {
  commitPostFile,
  deletePostFile,
  deleteBranch,
} from "./git-publisher";

export interface PostMdxData {
  title: string;
  description?: string;
  pubDate?: string;
  heroImage?: string;
  template?: string;
  defaultWidth?: string;
  wideWidth?: string;
  author?: string;
  draft?: boolean;
  contentMdx?: string;
}

export interface SavePostPayload {
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

export interface SavePostResult {
  success: boolean;
  status?: number;
  id?: string;
  slug?: string;
  gitBranch?: string | null;
  prNumber?: number | null;
  prUrl?: string | null;
  committedToGitHub?: boolean;
  merged?: boolean;
  statusState?: "draft" | "published";
  message?: string;
  updated_at?: string;
  error?: string;
}

export interface DeletePostResult {
  success: boolean;
  deletedFromGitHub: boolean;
  error?: string;
}

/**
 * Pure function: formats and serializes post attributes into standard YAML frontmatter + MDX body.
 * Guaranteed zero side-effects and 100% unit-testable.
 */
export function serializePostMdx(data: PostMdxData): string {
  const {
    title,
    description = "",
    pubDate = new Date().toISOString(),
    heroImage = "",
    template = "default",
    defaultWidth = "60rem",
    wideWidth = "70rem",
    author = "jeflopo",
    draft = true,
    contentMdx = "",
  } = data;

  const today = pubDate.split("T")[0];
  const safeTitle = title.replace(/'/g, "''").replace(/[\r\n]+/g, " ").trim();
  const safeDesc = description.replace(/'/g, "''").replace(/[\r\n]+/g, " ").trim();
  const heroLine = heroImage ? `heroImage: '${heroImage.replace(/'/g, "''")}'\n` : "";
  const templateLine = `template: '${template || "default"}'\n`;
  const defaultWidthLine = `defaultWidth: '${defaultWidth || "60rem"}'\n`;
  const wideWidthLine = `wideWidth: '${wideWidth || "70rem"}'\n`;

  return `---
title: '${safeTitle}'
description: '${safeDesc}'
pubDate: '${today}'
${heroLine}${templateLine}${defaultWidthLine}${wideWidthLine}author: '${author}'
draft: ${draft}
---

${contentMdx || ""}
`;
}

/**
 * Synchronizes MDX content to local filesystem when running in Node.js development.
 */
async function syncLocalFilesystem(slug: string, mdxContent: string): Promise<void> {
  if (typeof process === "undefined" || !process.versions?.node) return;

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
    console.warn("Local filesystem write warning:", localErr);
  }
}

/**
 * Orchestrates post saving, validating invariants, checking concurrency locks,
 * serializing MDX, coordinating Git branch & PR lifecycle, and updating Cloudflare D1.
 */
export async function savePostLifecycle(options: {
  payload: SavePostPayload;
  user: { id: string; username?: string };
  db: DbClient;
  locals?: App.Locals;
}): Promise<SavePostResult> {
  const { payload, user, db, locals } = options;

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
  } = payload;

  if (!id || !slug || !title) {
    return { success: false, status: 400, error: "ID, slug, and title are required" };
  }

  const cleanSlug = slug.trim().toLowerCase();
  const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!SLUG_REGEX.test(cleanSlug)) {
    return {
      success: false,
      status: 400,
      error: "Invalid post slug format. Must be lowercase alphanumeric with hyphens.",
    };
  }

  // 1. Verify pessimistic concurrency lock
  const lockStatus = await getLockStatus(db, id, user.id);
  if (lockStatus.locked) {
    return {
      success: false,
      status: 423,
      error: `Cannot save: Post is currently locked by @${lockStatus.lock?.username || "another editor"}.`,
    };
  }

  const tagsStr = Array.isArray(tags) ? JSON.stringify(tags) : tags;
  const now = new Date().toISOString();
  const effectivePubDate = pub_date || now;
  const isDraft = status === "draft";

  // 2. Check slug uniqueness
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
      return {
        success: false,
        status: 409,
        error: `Slug "${cleanSlug}" is already used by another post.`,
      };
    }
  }

  // 3. Serialize MDX frontmatter
  const mdxContent = serializePostMdx({
    title,
    description,
    pubDate: effectivePubDate,
    heroImage: featured_image,
    template,
    defaultWidth: default_width,
    wideWidth: wide_width,
    author,
    draft: isDraft,
    contentMdx: content_mdx,
  });

  // 4. Guaranteed D1 persistence: save post state first
  const baseRecord = {
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
    updatedAt: now,
  };

  if (existing) {
    await db.update(posts).set(baseRecord).where(eq(posts.id, id));
  } else {
    await db.insert(posts).values({
      id,
      createdAt: now,
      ...baseRecord,
    });
  }

  // 5. Git-Sync Publisher: Atomic main publishing for Published, clean D1 isolation for Drafts
  const githubPat = getGithubPat(locals);
  const repo = "jeflopodev/blog-astro";
  const targetPath = `src/content/blog/${cleanSlug}/index.mdx`;
  const legacyBranch = `content/${cleanSlug}`;

  const gitResult = {
    committed: false,
    message: "",
  };

  if (isDraft) {
    // DRAFT: Do NOT push to Git. Drafts live safely in D1.
    // If this post was previously published on main, we remove it from main (unpublish)
    if (existing?.status === "published" && githubPat) {
      const gitConfig = { pat: githubPat, repo };
      await deletePostFile(
        gitConfig,
        targetPath,
        `feat(blog): unpublish "${title}" (moved to draft)`
      );
      deleteBranch(gitConfig, legacyBranch).catch(() => {});
      gitResult.message = "Unpublished! Post moved back to draft in D1.";
    } else {
      gitResult.message = "Draft saved successfully to D1.";
    }
  } else {
    // PUBLISHED: Atomic commit directly to main
    if (githubPat) {
      const gitConfig = { pat: githubPat, repo };
      const commitRes = await commitPostFile(
        gitConfig,
        "main",
        targetPath,
        mdxContent,
        `feat(blog): publish "${title}" by @${author}`
      );

      if (commitRes.success) {
        gitResult.committed = true;
        gitResult.message = "Published to main on GitHub & saved to D1.";
        deleteBranch(gitConfig, legacyBranch).catch(() => {});
      } else {
        console.error("GitHub commit to main error:", commitRes.error);
        gitResult.message = `Saved to D1, but GitHub publish failed: ${commitRes.error}`;
      }
    } else {
      gitResult.message = "Saved to D1 as published (GitHub PAT not configured).";
    }
  }

  // 6. Local filesystem fallback write for local development
  await syncLocalFilesystem(cleanSlug, mdxContent);

  // 7. Update Git sync metadata in Cloudflare D1
  await db.update(posts).set({
    gitBranch: null,
    prNumber: null,
    prUrl: null,
    updatedAt: now,
  }).where(eq(posts.id, id));

  return {
    success: true,
    status: 200,
    id,
    slug: cleanSlug,
    gitBranch: null,
    prNumber: null,
    prUrl: null,
    statusState: status,
    committedToGitHub: gitResult.committed,
    message: gitResult.message,
    updated_at: now,
  };
}

/**
 * Coordinates post deletion from Cloudflare D1, GitHub remote repository, and local filesystem.
 */
export async function deletePostLifecycle(options: {
  id: string;
  db: DbClient;
  locals?: App.Locals;
}): Promise<DeletePostResult> {
  const { id, db, locals } = options;

  if (!id) {
    return { success: false, deletedFromGitHub: false, error: "Missing post ID" };
  }

  const [post] = await db
    .select({ slug: posts.slug })
    .from(posts)
    .where(eq(posts.id, id))
    .limit(1);

  const slug = post?.slug?.trim().toLowerCase();

  // 1. Delete from D1
  await db.delete(posts).where(eq(posts.id, id));

  let deletedFromGitHub = false;
  const githubPat = getGithubPat(locals);

  // 2. Synchronize deletion with GitHub
  if (githubPat && slug) {
    const repo = "jeflopodev/blog-astro";
    const branch = "main";
    const targetDir = `src/content/blog/${slug}`;

    try {
      const dirRes = await fetch(
        `https://api.github.com/repos/${repo}/contents/${targetDir}?ref=${branch}`,
        {
          headers: {
            Authorization: `Bearer ${githubPat}`,
            "User-Agent": "Astro-Blog-Admin",
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

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
        // Check for legacy flat files
        for (const ext of [".mdx", ".md"]) {
          const filePath = `src/content/blog/${slug}${ext}`;
          const fileRes = await fetch(
            `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`,
            {
              headers: {
                Authorization: `Bearer ${githubPat}`,
                "User-Agent": "Astro-Blog-Admin",
                Accept: "application/vnd.github.v3+json",
              },
            }
          );
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

  // 3. Local filesystem cleanup
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
      console.warn("Local filesystem delete warning:", localErr);
    }
  }

  return { success: true, deletedFromGitHub };
}
