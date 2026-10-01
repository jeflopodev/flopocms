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

export const DEFAULT_BRANCH = "main";

export interface GithubContentsConfig {
  pat: string;
  repo: string;
  branch?: string;
}

export interface CommitRequest {
  /** Commit message recorded against the GitHub mutation. */
  message: string;
  /**
   * Compare-and-swap precondition: the blob sha the Editor loaded.
   * `undefined` preserves the legacy re-read-and-overwrite behaviour.
   * A string must match the current blob sha or the write fails with `conflict: true`.
   * `null` means create-only: the write fails when the path already exists.
   */
  expectedSha?: string | null;
}

export interface ContentsResult {
  success: boolean;
  /** Blob sha after the mutation, when GitHub reports one. */
  sha?: string;
  /** Commit sha for an atomic multi-file commit, when reported. */
  commitSha?: string;
  /**
   * True only when bytes were actually removed. An idempotent delete of something
   * already absent reports `success: true, deleted: false`.
   */
  deleted?: boolean;
  /** True when the write was refused because the precondition no longer holds. */
  conflict?: boolean;
  error?: string;
}

export interface ReadFileResult {
  content: string;
  sha: string;
}

export interface ReadBytesResult {
  bytes: Uint8Array;
  sha: string;
}

export interface CommitFile {
  path: string;
  /** Text or raw bytes to write, or null to delete the path. */
  content: string | Uint8Array | null;
}

export interface AtomicCommitRequest extends CommitRequest {
  /** Ref sha the Editor based this commit on. Mismatch fails fast with `conflict: true`. */
  baseRefSha?: string;
}

export interface GithubContents {
  /** Reads a text file, or null when the path is absent. */
  readFile(path: string): Promise<ReadFileResult | null>;

  /** Reads raw bytes (binary-safe, no text decoding), or null when absent. */
  readBytes(path: string): Promise<ReadBytesResult | null>;

  /** The `main` ref sha, or null when it cannot be read. Used as an atomic base. */
  refSha(): Promise<string | null>;

  /** Creates or overwrites a file. Accepts text or raw bytes. */
  putFile(path: string, content: string | Uint8Array, commit: CommitRequest): Promise<ContentsResult>;

  /** Removes a file. Succeeds even when the file is already absent. */
  deleteFile(path: string, commit: CommitRequest): Promise<ContentsResult>;

  /** Removes every file directly inside a directory, in one atomic commit. */
  deleteDirectory(path: string, commit: AtomicCommitRequest): Promise<ContentsResult>;

  /**
   * Lists the full paths of the files directly inside a directory. An absent
   * directory counts as empty rather than an error, so callers never branch on it.
   */
  listDirectory(path: string): Promise<ContentsResult & { paths?: string[] }>;

  /**
   * Lands every file in one atomic commit via blobs → tree → commit → ref
   * (`force: false`). Either `main` holds the whole change or none of it.
   */
  commitFiles(files: CommitFile[], commit: AtomicCommitRequest): Promise<ContentsResult>;
}

function encodeBase64(content: string | Uint8Array): string {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  return Buffer.from(bytes).toString("base64");
}

export class HttpGithubContents implements GithubContents {
  private readonly repo: string;
  private readonly branch: string;

  constructor(private readonly config: GithubContentsConfig) {
    if (!config.repo) {
      throw new Error("GithubContentsConfig.repo is required");
    }
    this.repo = config.repo;
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

  async readBytes(path: string): Promise<ReadBytesResult | null> {
    try {
      const metaRes = await fetch(this.url(path, this.branch), { headers: this.headers() });
      if (!metaRes.ok) return null;
      const meta = (await metaRes.json()) as any;
      const sha = typeof meta?.sha === "string" ? meta.sha : null;

      // Small files ride the metadata call; large ones (>1MB) omit `content`.
      if (typeof meta?.content === "string" && meta.content.length > 0) {
        return { bytes: Buffer.from(String(meta.content).replace(/\s/g, ""), "base64"), sha: sha ?? "" };
      }
      if (!sha) return null;

      const blobRes = await fetch(this.gitUrl(`blobs/${sha}`), {
        headers: { ...this.headers(), Accept: "application/vnd.github.raw" },
      });
      if (!blobRes.ok) return null;
      return { bytes: new Uint8Array(await blobRes.arrayBuffer()), sha };
    } catch {
      return null;
    }
  }

  async refSha(): Promise<string | null> {
    try {
      const res = await fetch(this.gitUrl(`refs/heads/${this.branch}`), { headers: this.headers() });
      if (!res.ok) return null;
      const data = (await res.json()) as any;
      return typeof data?.object?.sha === "string" ? data.object.sha : null;
    } catch {
      return null;
    }
  }

  private conflict(message: string): ContentsResult {
    return { success: false, conflict: true, error: message };
  }

  private async lookupSha(path: string): Promise<string | null> {
    try {
      const checkRes = await fetch(this.url(path, this.branch), { headers: this.headers() });
      if (!checkRes.ok) return null;
      const checkData = (await checkRes.json()) as any;
      return typeof checkData?.sha === "string" ? checkData.sha : null;
    } catch (err) {
      console.warn("GitHub Contents: sha lookup warning:", err);
      return null;
    }
  }

  async putFile(path: string, content: string | Uint8Array, commit: CommitRequest): Promise<ContentsResult> {
    // Compare-and-swap when the caller names what it loaded; legacy re-read otherwise.
    if (commit.expectedSha !== undefined) {
      if (commit.expectedSha === null) {
        const current = await this.lookupSha(path);
        if (current) return this.conflict(`409 Conflict: "${path}" already exists on ${this.branch}. Reload and merge.`);
      } else {
        const current = await this.lookupSha(path);
        if (!current) return this.conflict(`409 Conflict: "${path}" is absent on ${this.branch}. Reload and merge.`);
        if (current !== commit.expectedSha) {
          return this.conflict(`409 Conflict: "${path}" moved on ${this.branch}. Reload and merge.`);
        }
      }
    }

    let sha: string | undefined;
    if (commit.expectedSha === undefined) {
      sha = (await this.lookupSha(path)) ?? undefined;
    } else if (commit.expectedSha !== null) {
      sha = commit.expectedSha;
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
        const text = await putRes.text();
        if (putRes.status === 409 || putRes.status === 422) return this.conflict(`409 Conflict: ${text}`);
        return { success: false, error: text };
      }

      const putData = (await putRes.json()) as any;
      return { success: true, sha: putData?.content?.sha };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to write file to GitHub" };
    }
  }

  async deleteFile(path: string, commit: CommitRequest): Promise<ContentsResult> {
    if (commit.expectedSha !== undefined && commit.expectedSha !== null) {
      const current = await this.lookupSha(path);
      if (!current) return { success: true, deleted: false };
      if (current !== commit.expectedSha) {
        return this.conflict(`409 Conflict: "${path}" moved on ${this.branch}. Reload and merge.`);
      }
      try {
        const delRes = await fetch(this.url(path), {
          method: "DELETE",
          headers: this.headers(),
          body: JSON.stringify({ message: commit.message, sha: commit.expectedSha, branch: this.branch }),
        });
        if (!delRes.ok) {
          const text = await delRes.text();
          if (delRes.status === 409 || delRes.status === 422) return this.conflict(`409 Conflict: ${text}`);
          return { success: false, error: text };
        }
        return { success: true, deleted: true };
      } catch (err: any) {
        return { success: false, error: err?.message || "Failed to delete file from GitHub" };
      }
    }

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
        const text = await delRes.text();
        if (delRes.status === 409 || delRes.status === 422) return this.conflict(`409 Conflict: ${text}`);
        return { success: false, error: text };
      }
      return { success: true, deleted: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to delete file from GitHub" };
    }
  }

  async listDirectory(path: string): Promise<ContentsResult & { paths?: string[] }> {
    try {
      const listRes = await fetch(this.url(path, this.branch), { headers: this.headers() });
      if (listRes.status === 404) return { success: true, paths: [] };
      if (!listRes.ok) return { success: false, error: await listRes.text() };
      const listed = await listRes.json();
      if (!Array.isArray(listed)) return { success: true, paths: [] };
      const paths = listed
        .filter((item) => item?.type === "file" && typeof item.path === "string")
        .map((item) => item.path as string);
      return { success: true, paths };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to list directory on GitHub" };
    }
  }

  async deleteDirectory(path: string, commit: AtomicCommitRequest): Promise<ContentsResult> {
    const listed = await this.listDirectory(path);
    if (!listed.success) return listed;
    const paths = listed.paths ?? [];
    if (paths.length === 0) return { success: true, deleted: false };

    // One atomic commit for the whole bundle, not one DELETE per file.
    return this.commitFiles(
      paths.map((filePath) => ({ path: filePath, content: null })),
      commit
    );
  }

  private gitUrl(suffix: string): string {
    return `https://api.github.com/repos/${this.repo}/git/${suffix}`;
  }

  async commitFiles(files: CommitFile[], commit: AtomicCommitRequest): Promise<ContentsResult> {
    if (files.length === 0) return { success: true };

    try {
      const refRes = await fetch(this.gitUrl(`refs/heads/${this.branch}`), { headers: this.headers() });
      if (!refRes.ok) return { success: false, error: await refRes.text() };
      const refData = (await refRes.json()) as any;
      const baseCommitSha = refData?.object?.sha as string | undefined;
      if (!baseCommitSha) return { success: false, error: "GitHub ref has no commit sha" };

      if (commit.baseRefSha && baseCommitSha !== commit.baseRefSha) {
        return this.conflict(`409 Conflict: ${this.branch} moved. Reload and merge.`);
      }

      const commitRes = await fetch(this.gitUrl(`commits/${baseCommitSha}`), { headers: this.headers() });
      if (!commitRes.ok) return { success: false, error: await commitRes.text() };
      const commitData = (await commitRes.json()) as any;
      const baseTreeSha = commitData?.tree?.sha as string | undefined;
      if (!baseTreeSha) return { success: false, error: "GitHub commit has no tree sha" };

      const tree: { path: string; mode: "100644"; type: "blob"; sha: string | null }[] = [];
      for (const file of files) {
        if (file.content === null) {
          tree.push({ path: file.path, mode: "100644", type: "blob", sha: null });
          continue;
        }
        const blobRes = await fetch(this.gitUrl("blobs"), {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({ content: encodeBase64(file.content), encoding: "base64" }),
        });
        if (!blobRes.ok) return { success: false, error: await blobRes.text() };
        const blobData = (await blobRes.json()) as any;
        if (!blobData?.sha) return { success: false, error: "GitHub blob has no sha" };
        tree.push({ path: file.path, mode: "100644", type: "blob", sha: blobData.sha });
      }

      const treeRes = await fetch(this.gitUrl("trees"), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ base_tree: baseTreeSha, tree }),
      });
      if (!treeRes.ok) return { success: false, error: await treeRes.text() };
      const treeData = (await treeRes.json()) as any;
      if (!treeData?.sha) return { success: false, error: "GitHub tree has no sha" };

      const newCommitRes = await fetch(this.gitUrl("commits"), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ message: commit.message, tree: treeData.sha, parents: [baseCommitSha] }),
      });
      if (!newCommitRes.ok) return { success: false, error: await newCommitRes.text() };
      const newCommitData = (await newCommitRes.json()) as any;
      if (!newCommitData?.sha) return { success: false, error: "GitHub commit has no sha" };

      const refUpdateRes = await fetch(this.gitUrl(`refs/heads/${this.branch}`), {
        method: "PATCH",
        headers: this.headers(),
        body: JSON.stringify({ sha: newCommitData.sha, force: false }),
      });
      if (!refUpdateRes.ok) {
        const text = await refUpdateRes.text();
        if (refUpdateRes.status === 409 || refUpdateRes.status === 422) return this.conflict(`409 Conflict: ${text}`);
        return { success: false, error: text };
      }

      return { success: true, commitSha: newCommitData.sha, deleted: files.some((file) => file.content === null) };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to commit files to GitHub" };
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
  private shaCounter = 0;
  private refCounter = 0;
  private storedRef = "ref-0";

  readonly commits: { action: "put" | "delete" | "commit"; path: string; message: string }[] = [];

  private nextPutFailure?: string;
  private nextDeleteFailure?: string;
  private nextCommitFailure?: string;

  /** Test helper: make the next write fail once, as an unreachable GitHub would. */
  failNextPut(error: string): void {
    this.nextPutFailure = error;
  }

  /** Test helper: make the next removal fail once. */
  failNextDelete(error: string): void {
    this.nextDeleteFailure = error;
  }

  /** Test helper: make the next atomic commit fail once. */
  failNextCommit(error: string): void {
    this.nextCommitFailure = error;
  }

  private nextSha(): string {
    this.shaCounter += 1;
    return `sha-${this.shaCounter}`;
  }

  private advanceRef(): string {
    this.refCounter += 1;
    this.storedRef = `ref-${this.refCounter}`;
    return this.storedRef;
  }

  /** Test helper: the ref sha an atomic commit would base itself on. */
  currentRef(): string {
    return this.storedRef;
  }

  async readFile(path: string): Promise<ReadFileResult | null> {
    const entry = this.files.get(path);
    if (!entry) return null;
    const content =
      typeof entry.content === "string" ? entry.content : Buffer.from(entry.content).toString("utf-8");
    return { content, sha: entry.sha };
  }

  async readBytes(path: string): Promise<ReadBytesResult | null> {
    const entry = this.files.get(path);
    if (!entry) return null;
    const bytes =
      typeof entry.content === "string" ? new TextEncoder().encode(entry.content) : entry.content;
    return { bytes, sha: entry.sha };
  }

  async refSha(): Promise<string | null> {
    return this.storedRef;
  }

  async putFile(path: string, content: string | Uint8Array, commit: CommitRequest): Promise<ContentsResult> {
    if (this.nextPutFailure) {
      const error = this.nextPutFailure;
      this.nextPutFailure = undefined;
      return { success: false, error };
    }

    if (commit.expectedSha !== undefined) {
      const current = this.files.get(path)?.sha ?? null;
      if (commit.expectedSha === null ? current !== null : current !== commit.expectedSha) {
        return { success: false, conflict: true, error: `409 Conflict: "${path}" moved. Reload and merge.` };
      }
    }

    const sha = this.nextSha();
    this.files.set(path, { content, sha });
    this.commits.push({ action: "put", path, message: commit.message });
    this.advanceRef();
    return { success: true, sha };
  }

  async deleteFile(path: string, commit: CommitRequest): Promise<ContentsResult> {
    if (this.files.has(path) && this.nextDeleteFailure) {
      const error = this.nextDeleteFailure;
      this.nextDeleteFailure = undefined;
      return { success: false, error };
    }

    if (commit.expectedSha !== undefined && commit.expectedSha !== null) {
      const current = this.files.get(path);
      if (current && current.sha !== commit.expectedSha) {
        return { success: false, conflict: true, error: `409 Conflict: "${path}" moved. Reload and merge.` };
      }
      if (!current) return { success: true, deleted: false };
    }

    const existed = this.files.delete(path);
    if (existed) {
      this.commits.push({ action: "delete", path, message: commit.message });
      this.advanceRef();
    }
    return { success: true, deleted: existed };
  }

  async listDirectory(path: string): Promise<ContentsResult & { paths?: string[] }> {
    const prefix = path.endsWith("/") ? path : `${path}/`;
    return { success: true, paths: [...this.files.keys()].filter((key) => key.startsWith(prefix)) };
  }

  async deleteDirectory(path: string, commit: AtomicCommitRequest): Promise<ContentsResult> {
    const listed = await this.listDirectory(path);
    if (!listed.success) return listed;
    const children = listed.paths ?? [];
    if (children.length === 0) return { success: true, deleted: false };

    return this.commitFiles(
      children.map((child) => ({ path: child, content: null })),
      commit
    );
  }

  async commitFiles(files: CommitFile[], commit: AtomicCommitRequest): Promise<ContentsResult> {
    if (files.length === 0) return { success: true };

    if (this.nextCommitFailure) {
      const error = this.nextCommitFailure;
      this.nextCommitFailure = undefined;
      return { success: false, error };
    }

    if (commit.baseRefSha && commit.baseRefSha !== this.storedRef) {
      return { success: false, conflict: true, error: "409 Conflict: main moved. Reload and merge." };
    }

    // All-or-nothing: stage against a copy, swap only when every entry applies.
    const staged = new Map(this.files);
    const stagedShas = new Map<string, string>();
    for (const file of files) {
      if (file.content === null) {
        staged.delete(file.path);
      } else {
        const sha = this.nextSha();
        staged.set(file.path, { content: file.content, sha });
        stagedShas.set(file.path, sha);
      }
    }

    this.files = staged;
    const commitSha = this.advanceRef();
    for (const file of files) {
      this.commits.push({
        action: "commit",
        path: file.path,
        message: commit.message,
      });
    }

    const firstPut = files.find((file) => file.content !== null);
    return {
      success: true,
      commitSha,
      sha: firstPut ? stagedShas.get(firstPut.path) : undefined,
      deleted: files.some((file) => file.content === null),
    };
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
