import type { D1Database } from "@cloudflare/workers-types";
import { env } from "cloudflare:workers";

/**
 * Resolves an environment binding across Cloudflare Workers runtime and Node/process.env.
 */
export function getRuntimeEnv<T = string>(key: string, locals?: App.Locals): T | undefined {
  // 1. Cloudflare Workers ambient module env
  const cloudflareModuleEnv = (env as Record<string, any>)?.[key];
  if (cloudflareModuleEnv !== undefined) return cloudflareModuleEnv as T;

  // 2. Astro locals fallback (safely guarded against throwing getters in Astro v6/v7)
  try {
    const localsEnv = (locals as any)?.env?.[key];
    if (localsEnv !== undefined) return localsEnv as T;

    const localsCfContext = (locals as any)?.cfContext?.env?.[key];
    if (localsCfContext !== undefined) return localsCfContext as T;

    const localsRuntime = (locals as any)?.runtime?.env?.[key];
    if (localsRuntime !== undefined) return localsRuntime as T;
  } catch {
    // Ignore deprecated throwing getters
  }

  // 3. Node process.env fallback (local scripts, dev server, CLI)
  if (typeof process !== "undefined" && process.env?.[key] !== undefined) {
    return process.env[key] as unknown as T;
  }

  return undefined;
}

/**
 * Resolves GitHub Personal Access Token (GITHUB_PAT) for Git-Sync publishing.
 */
export function getGithubPat(locals?: App.Locals): string | undefined {
  return getRuntimeEnv<string>("GITHUB_PAT", locals);
}

/**
 * Resolves target GitHub repository (GITHUB_REPO) for Git-Sync publishing.
 */
export function getGithubRepo(locals?: App.Locals): string | undefined {
  return getRuntimeEnv<string>("GITHUB_REPO", locals);
}

/**
 * Repo-relative directory holding Post Bundles on `main`, and repo-relative
 * directory holding asset bytes on `main`.
 */
export const DEFAULT_CONTENT_DIR = "src/content/blog";
export const DEFAULT_UPLOADS_DIR = "public/uploads";

export function getContentDir(locals?: App.Locals): string {
  return getRuntimeEnv<string>("CONTENT_DIR", locals) ?? DEFAULT_CONTENT_DIR;
}

export function getUploadsDir(locals?: App.Locals): string {
  return getRuntimeEnv<string>("UPLOADS_DIR", locals) ?? DEFAULT_UPLOADS_DIR;
}

/**
 * Resolves Cloudflare D1 Database binding 'DB'.
 */
export function getD1Database(locals?: App.Locals): D1Database {
  const db = getRuntimeEnv<D1Database>("DB", locals);
  if (!db) {
    throw new Error(
      "D1 database binding 'DB' is not available. Ensure cloudflare.config.ts contains the DB binding for D1."
    );
  }
  return db;
}
