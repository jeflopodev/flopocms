export interface GitSyncConfig {
  pat: string;
  repo: string; // e.g. "jeflopodev/blog-astro"
}

export interface CommitPostOptions {
  slug: string;
  mdxContent: string;
  status: "draft" | "published";
  title: string;
  author: string;
  existingPrNumber?: number | null;
}

export interface GitSyncResult {
  branch: string;
  committed: boolean;
  prNumber?: number;
  prUrl?: string;
  merged?: boolean;
  error?: string;
}

/**
 * Ensures a branch exists in the repository.
 * If it doesn't exist, branches off from the base branch (default: main).
 */
export async function ensureBranch(
  config: GitSyncConfig,
  branch: string,
  baseBranch = "main"
): Promise<{ success: boolean; sha?: string; created: boolean; error?: string }> {
  const { pat, repo } = config;
  const headers = {
    Authorization: `Bearer ${pat}`,
    "User-Agent": "Astro-Blog-Admin",
    Accept: "application/vnd.github.v3+json",
  };

  // 1. Check if branch already exists
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${branch}`, {
      headers,
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      return { success: true, sha: data.object?.sha, created: false };
    }
  } catch (err: any) {
    console.warn("Check branch error:", err);
  }

  // 2. Fetch latest commit SHA from baseBranch
  let baseSha: string;
  try {
    const baseRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${baseBranch}`, {
      headers,
    });
    if (!baseRes.ok) {
      const errText = await baseRes.text();
      return { success: false, created: false, error: `Base branch "${baseBranch}" not found: ${errText}` };
    }
    const baseData = (await baseRes.json()) as any;
    baseSha = baseData.object?.sha;
  } catch (err: any) {
    return { success: false, created: false, error: `Failed to get base branch SHA: ${err.message}` };
  }

  // 3. Create branch
  try {
    const createRes = await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: baseSha,
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      return { success: false, created: false, error: `Failed to create branch: ${errText}` };
    }

    const createData = (await createRes.json()) as any;
    return { success: true, sha: createData.object?.sha, created: true };
  } catch (err: any) {
    return { success: false, created: false, error: `Failed to create branch: ${err.message}` };
  }
}

/**
 * Commits the post MDX file to the specified branch.
 */
export async function commitPostFile(
  config: GitSyncConfig,
  branch: string,
  targetPath: string,
  content: string,
  message: string
): Promise<{ success: boolean; sha?: string; error?: string }> {
  const { pat, repo } = config;
  const headers = {
    Authorization: `Bearer ${pat}`,
    "User-Agent": "Astro-Blog-Admin",
    Accept: "application/vnd.github.v3+json",
  };

  // 1. Check existing file SHA on this branch
  let fileSha: string | undefined;
  try {
    const checkRes = await fetch(
      `https://api.github.com/repos/${repo}/contents/${targetPath}?ref=${branch}`,
      { headers }
    );
    if (checkRes.ok) {
      const checkData = (await checkRes.json()) as any;
      fileSha = checkData.sha;
    }
  } catch (err) {
    console.warn("Check file SHA warning:", err);
  }

  // 2. Put file contents
  const base64Content = Buffer.from(content, "utf-8").toString("base64");
  try {
    const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${targetPath}`, {
      method: "PUT",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        content: base64Content,
        branch,
        ...(fileSha ? { sha: fileSha } : {}),
      }),
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      return { success: false, error: `Failed to commit file: ${errText}` };
    }

    const putData = (await putRes.json()) as any;
    return { success: true, sha: putData.content?.sha };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to commit file" };
  }
}

/**
 * Ensures an open Pull Request exists from headBranch to baseBranch.
 * If none exists, creates a new one.
 */
export async function ensurePullRequest(
  config: GitSyncConfig,
  headBranch: string,
  baseBranch = "main",
  title: string,
  body: string
): Promise<{ success: boolean; prNumber?: number; prUrl?: string; error?: string }> {
  const { pat, repo } = config;
  const headers = {
    Authorization: `Bearer ${pat}`,
    "User-Agent": "Astro-Blog-Admin",
    Accept: "application/vnd.github.v3+json",
  };

  const owner = repo.split("/")[0];

  // 1. Check if PR already open
  try {
    const listRes = await fetch(
      `https://api.github.com/repos/${repo}/pulls?head=${owner}:${headBranch}&base=${baseBranch}&state=open`,
      { headers }
    );
    if (listRes.ok) {
      const listData = (await listRes.json()) as any[];
      if (listData && listData.length > 0) {
        return {
          success: true,
          prNumber: listData[0].number,
          prUrl: listData[0].html_url,
        };
      }
    }
  } catch (err) {
    console.warn("Check PR warning:", err);
  }

  // 2. Create new PR
  try {
    const createRes = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        head: headBranch,
        base: baseBranch,
        body,
        draft: false,
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      return { success: false, error: `Failed to create PR: ${errText}` };
    }

    const prData = (await createRes.json()) as any;
    return {
      success: true,
      prNumber: prData.number,
      prUrl: prData.html_url,
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create PR" };
  }
}

/**
 * Merges a Pull Request into main.
 */
export async function mergePullRequest(
  config: GitSyncConfig,
  prNumber: number,
  commitTitle: string,
  mergeMethod: "squash" | "merge" | "rebase" = "squash"
): Promise<{ success: boolean; merged: boolean; message?: string; error?: string }> {
  const { pat, repo } = config;
  const headers = {
    Authorization: `Bearer ${pat}`,
    "User-Agent": "Astro-Blog-Admin",
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls/${prNumber}/merge`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        commit_title: commitTitle,
        merge_method: mergeMethod,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, merged: false, error: `Merge failed: ${errText}` };
    }

    const data = (await res.json()) as any;
    return { success: true, merged: Boolean(data.merged), message: data.message };
  } catch (err: any) {
    return { success: false, merged: false, error: err.message || "Merge request error" };
  }
}

/**
 * Deletes a remote Git branch.
 */
export async function deleteBranch(
  config: GitSyncConfig,
  branch: string
): Promise<boolean> {
  const { pat, repo } = config;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/git/refs/heads/${branch}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${pat}`,
        "User-Agent": "Astro-Blog-Admin",
        Accept: "application/vnd.github.v3+json",
      },
    });
    return res.ok;
  } catch (err) {
    console.warn("Delete branch warning:", err);
    return false;
  }
}

/**
 * Deletes a file from the specified branch (default: main).
 */
export async function deletePostFile(
  config: GitSyncConfig,
  targetPath: string,
  message: string,
  branch = "main"
): Promise<{ success: boolean; error?: string }> {
  const { pat, repo } = config;
  const headers = {
    Authorization: `Bearer ${pat}`,
    "User-Agent": "Astro-Blog-Admin",
    Accept: "application/vnd.github.v3+json",
  };

  try {
    const checkRes = await fetch(
      `https://api.github.com/repos/${repo}/contents/${targetPath}?ref=${branch}`,
      { headers }
    );
    if (!checkRes.ok) {
      // File doesn't exist on this branch, consider deleted
      return { success: true };
    }
    const checkData = (await checkRes.json()) as any;
    const sha = checkData.sha;
    if (!sha) return { success: true };

    const delRes = await fetch(`https://api.github.com/repos/${repo}/contents/${targetPath}`, {
      method: "DELETE",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        sha,
        branch,
      }),
    });

    if (!delRes.ok) {
      const errText = await delRes.text();
      return { success: false, error: `Failed to delete file: ${errText}` };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to delete file" };
  }
}
