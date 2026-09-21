/**
 * GitHub Contents module.
 *
 * One interface over the GitHub Contents and refs APIs. Callers say *what* they want
 * (put this file on this branch, remove this directory) and never learn about base64,
 * the sha precondition, the header set or the commit-message convention.
 *
 * The HTTP adapter talks to the real API in production; the in-memory adapter is a
 * local substitute so callers can be tested without a network or a PAT.
 */

export const DEFAULT_REPO = "jeflopodev/blog-astro";
export const DEFAULT_BRANCH = "main";

export interface GithubContentsConfig {
  pat: string;
  repo?: string;
  branch?: string;
}

export interface CommitRequest {
  /** Commit message recorded against the GitHub mutation. */
  message: string;
}

export interface ContentsResult {
  success: boolean;
  /** Blob sha after the mutation, when GitHub reports one. */
  sha?: string;
  /**
   * True only when bytes were actually removed. An idempotent delete of something
   * already absent reports `success: true, deleted: false`.
   */
  deleted?: boolean;
  error?: string;
}

export interface ReadFileResult {
  content: string;
  sha: string;
}

export interface GithubContents {
  /** Reads a text file, or null when the path is absent. */
  readFile(path: string): Promise<ReadFileResult | null>;

  /** Creates or overwrites a file. Accepts text or raw bytes. */
  putFile(path: string, content: string | Uint8Array, commit: CommitRequest): Promise<ContentsResult>;

  /** Removes a file. Succeeds even when the file is already absent. */
  deleteFile(path: string, commit: CommitRequest): Promise<ContentsResult>;

  /** Removes every file directly inside a directory. */
  deleteDirectory(path: string, commit: CommitRequest): Promise<ContentsResult>;

  /** Removes a branch. Succeeds when the branch is already gone. */
  deleteBranch(branch: string): Promise<boolean>;
}

function encodeBase64(content: string | Uint8Array): string {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  return Buffer.from(bytes).toString("base64");
}

export class HttpGithubContents implements GithubContents {
  private readonly repo: string;
  private readonly branch: string;

  constructor(private readonly config: GithubContentsConfig) {
    this.repo = config.repo || DEFAULT_REPO;
    this.branch = config.branch || DEFAULT_BRANCH;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.pat}`,
      "User-Agent": "Astro-Blog-Admin",
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    };
  }

  private url(path: string, ref?: string): string {
    const suffix = ref ? `?ref=${ref}` : "";
    return `https://api.github.com/repos/${this.repo}/contents/${path}${suffix}`;
  }

  async readFile(path: string): Promise<ReadFileResult | null> {
    try {
      const res = await fetch(this.url(path, this.branch), { headers: this.headers() });
      if (!res.ok) return null;
      const data = (await res.json()) as any;
      if (!data?.content) return null;
      const decoded = Buffer.from(String(data.content), "base64").toString("utf-8");
      return { content: decoded, sha: data.sha };
    } catch {
      return null;
    }
  }

  async putFile(path: string, content: string | Uint8Array, commit: CommitRequest): Promise<ContentsResult> {
    let sha: string | undefined;
    try {
      const checkRes = await fetch(this.url(path, this.branch), { headers: this.headers() });
      if (checkRes.ok) {
        const checkData = (await checkRes.json()) as any;
        sha = checkData?.sha;
      }
    } catch (err) {
      console.warn("GitHub Contents: sha lookup warning:", err);
    }

    try {
      const putRes = await fetch(this.url(path), {
        method: "PUT",
        headers: this.headers(),
        body: JSON.stringify({
          message: commit.message,
          content: encodeBase64(content),
          branch: this.branch,
          ...(sha ? { sha } : {}),
        }),
      });

      if (!putRes.ok) {
        return { success: false, error: await putRes.text() };
      }

      const putData = (await putRes.json()) as any;
      return { success: true, sha: putData?.content?.sha };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to write file to GitHub" };
    }
  }

  async deleteFile(path: string, commit: CommitRequest): Promise<ContentsResult> {
    let sha: string | undefined;
    try {
      const checkRes = await fetch(this.url(path, this.branch), { headers: this.headers() });
      if (!checkRes.ok) return { success: true, deleted: false };
      const checkData = (await checkRes.json()) as any;
      sha = checkData?.sha;
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to look up file on GitHub" };
    }

    if (!sha) return { success: true, deleted: false };

    try {
      const delRes = await fetch(this.url(path), {
        method: "DELETE",
        headers: this.headers(),
        body: JSON.stringify({ message: commit.message, sha, branch: this.branch }),
      });

      if (!delRes.ok) {
        return { success: false, error: await delRes.text() };
      }
      return { success: true, deleted: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to delete file from GitHub" };
    }
  }

  async deleteDirectory(path: string, commit: CommitRequest): Promise<ContentsResult> {
    let items: any[];
    try {
      const listRes = await fetch(this.url(path, this.branch), { headers: this.headers() });
      if (!listRes.ok) return { success: true, deleted: false };
      const listed = await listRes.json();
      if (!Array.isArray(listed)) return { success: true, deleted: false };
      items = listed;
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to list directory on GitHub" };
    }

    let deleted = false;
    for (const item of items) {
      if (item?.type !== "file" || !item.sha) continue;
      const res = await this.deleteFile(item.path, commit);
      if (!res.success) return res;
      if (res.deleted) deleted = true;
    }

    return { success: true, deleted };
  }

  async deleteBranch(branch: string): Promise<boolean> {
    try {
      const res = await fetch(`https://api.github.com/repos/${this.repo}/git/refs/heads/${branch}`, {
        method: "DELETE",
        headers: this.headers(),
      });
      return res.ok || res.status === 404;
    } catch (err) {
      console.warn("Delete branch warning:", err);
      return false;
    }
  }
}

interface InMemoryEntry {
  content: string | Uint8Array;
  sha: string;
}

/**
 * Local substitute for the GitHub Contents module. Records the commits it was asked
 * to make so tests can assert on ordering and messages.
 */
export class InMemoryGithubContents implements GithubContents {
  private files = new Map<string, InMemoryEntry>();
  private branches = new Set<string>();
  private shaCounter = 0;

  readonly commits: { action: "put" | "delete"; path: string; message: string }[] = [];
  readonly deletedBranches: string[] = [];

  private nextPutFailure?: string;
  private nextDeleteFailure?: string;

  /** Test helper: make the next write fail once, as an unreachable GitHub would. */
  failNextPut(error: string): void {
    this.nextPutFailure = error;
  }

  /** Test helper: make the next removal fail once. */
  failNextDelete(error: string): void {
    this.nextDeleteFailure = error;
  }

  private nextSha(): string {
    this.shaCounter += 1;
    return `sha-${this.shaCounter}`;
  }

  async readFile(path: string): Promise<ReadFileResult | null> {
    const entry = this.files.get(path);
    if (!entry) return null;
    const content =
      typeof entry.content === "string" ? entry.content : Buffer.from(entry.content).toString("utf-8");
    return { content, sha: entry.sha };
  }

  async putFile(path: string, content: string | Uint8Array, commit: CommitRequest): Promise<ContentsResult> {
    if (this.nextPutFailure) {
      const error = this.nextPutFailure;
      this.nextPutFailure = undefined;
      return { success: false, error };
    }

    const sha = this.nextSha();
    this.files.set(path, { content, sha });
    this.commits.push({ action: "put", path, message: commit.message });
    return { success: true, sha };
  }

  async deleteFile(path: string, commit: CommitRequest): Promise<ContentsResult> {
    if (this.files.has(path) && this.nextDeleteFailure) {
      const error = this.nextDeleteFailure;
      this.nextDeleteFailure = undefined;
      return { success: false, error };
    }

    const existed = this.files.delete(path);
    if (existed) this.commits.push({ action: "delete", path, message: commit.message });
    return { success: true, deleted: existed };
  }

  async deleteDirectory(path: string, commit: CommitRequest): Promise<ContentsResult> {
    const prefix = path.endsWith("/") ? path : `${path}/`;
    const children = [...this.files.keys()].filter((key) => key.startsWith(prefix));

    // Delegate per file, exactly as the HTTP adapter does, so a substitute cannot be
    // more forgiving than the real thing when a removal fails partway.
    let deleted = false;
    for (const child of children) {
      const res = await this.deleteFile(child, commit);
      if (!res.success) return res;
      if (res.deleted) deleted = true;
    }

    return { success: true, deleted };
  }

  async deleteBranch(branch: string): Promise<boolean> {
    this.branches.delete(branch);
    this.deletedBranches.push(branch);
    return true;
  }

  /** Test helper: seed a file without recording a commit. */
  seedFile(path: string, content: string): void {
    this.files.set(path, { content, sha: this.nextSha() });
  }

  /** Test helper: does this path exist? */
  has(path: string): boolean {
    return this.files.has(path);
  }
}
