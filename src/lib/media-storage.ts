import { env } from "cloudflare:workers";

export interface MediaFile {
  filename: string;
  content: Uint8Array | Buffer;
  mimeType?: string;
}

export interface MediaStorageResult {
  success: boolean;
  url?: string;
  error?: string;
}

export interface MediaStorage {
  writeMedia(file: MediaFile): Promise<MediaStorageResult>;
  deleteMedia(filename: string): Promise<MediaStorageResult>;
}

export class GitHubMediaAdapter implements MediaStorage {
  constructor(
    private pat: string,
    private repo: string = "jeflopodev/blog-astro",
    private branch: string = "main"
  ) {}

  private getHeaders() {
    return {
      Authorization: `Bearer ${this.pat}`,
      "User-Agent": "Astro-Blog-Admin",
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    };
  }

  async writeMedia(file: MediaFile): Promise<MediaStorageResult> {
    const targetPath = `public/uploads/${file.filename}`;
    const headers = this.getHeaders();
    let sha: string | undefined;

    try {
      const checkRes = await fetch(
        `https://api.github.com/repos/${this.repo}/contents/${targetPath}?ref=${this.branch}`,
        { headers }
      );
      if (checkRes.ok) {
        const checkData = (await checkRes.json()) as any;
        sha = checkData.sha;
      }
    } catch (err) {
      console.warn("GitHub check file warning:", err);
    }

    const base64Content = Buffer.from(file.content).toString("base64");

    try {
      const putRes = await fetch(
        `https://api.github.com/repos/${this.repo}/contents/${targetPath}`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            message: `media(global): upload ${file.filename} [skip ci]`,
            content: base64Content,
            branch: this.branch,
            ...(sha ? { sha } : {}),
          }),
        }
      );

      if (!putRes.ok) {
        const putError = await putRes.text();
        console.error("GitHub media upload error:", putError);
        return { success: false, error: putError };
      }

      return { success: true, url: `/uploads/${file.filename}` };
    } catch (err: any) {
      return { success: false, error: err.message || "Failed to commit media to GitHub" };
    }
  }

  async deleteMedia(filename: string): Promise<MediaStorageResult> {
    const targetPath = `public/uploads/${filename}`;
    const headers = this.getHeaders();

    try {
      const checkRes = await fetch(
        `https://api.github.com/repos/${this.repo}/contents/${targetPath}?ref=${this.branch}`,
        { headers }
      );

      if (!checkRes.ok) {
        return { success: true }; // Already deleted or not found
      }

      const checkData = (await checkRes.json()) as any;
      if (!checkData?.sha) {
        return { success: true };
      }

      const delRes = await fetch(
        `https://api.github.com/repos/${this.repo}/contents/${targetPath}`,
        {
          method: "DELETE",
          headers,
          body: JSON.stringify({
            message: `media(global): delete ${filename}`,
            sha: checkData.sha,
            branch: this.branch,
          }),
        }
      );

      return { success: delRes.ok };
    } catch (err: any) {
      console.warn("GitHub media deletion warning:", err);
      return { success: false, error: err.message || "Failed to delete media from GitHub" };
    }
  }
}

export class LocalFsMediaAdapter implements MediaStorage {
  constructor(private baseDir?: string) {}

  private async getUploadsDir(): Promise<string> {
    const path = await import("node:path");
    return this.baseDir || path.resolve(process.cwd(), "public", "uploads");
  }

  async writeMedia(file: MediaFile): Promise<MediaStorageResult> {
    if (typeof process === "undefined" || !process.versions?.node) {
      return { success: false, error: "Node environment unavailable for local fs" };
    }

    try {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const uploadsDir = await this.getUploadsDir();

      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const filePath = path.join(uploadsDir, file.filename);
      fs.writeFileSync(filePath, Buffer.from(file.content));

      return { success: true, url: `/uploads/${file.filename}` };
    } catch (err: any) {
      console.warn("Local filesystem write error:", err);
      return { success: false, error: err.message || "Failed to write local media" };
    }
  }

  async deleteMedia(filename: string): Promise<MediaStorageResult> {
    if (typeof process === "undefined" || !process.versions?.node) {
      return { success: true };
    }

    try {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const uploadsDir = await this.getUploadsDir();
      const filePath = path.join(uploadsDir, filename);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return { success: true };
    } catch (err: any) {
      console.warn("Local file deletion warning:", err);
      return { success: false, error: err.message || "Failed to delete local media" };
    }
  }
}

export class CompositeMediaAdapter implements MediaStorage {
  constructor(private adapters: MediaStorage[]) {}

  async writeMedia(file: MediaFile): Promise<MediaStorageResult> {
    let lastUrl = `/uploads/${file.filename}`;
    let anySuccess = false;

    for (const adapter of this.adapters) {
      const res = await adapter.writeMedia(file);
      if (res.success) {
        anySuccess = true;
        if (res.url) lastUrl = res.url;
      }
    }

    return { success: anySuccess, url: lastUrl };
  }

  async deleteMedia(filename: string): Promise<MediaStorageResult> {
    for (const adapter of this.adapters) {
      await adapter.deleteMedia(filename);
    }
    return { success: true };
  }
}

export class InMemoryMediaAdapter implements MediaStorage {
  private files = new Map<string, Uint8Array | Buffer>();

  async writeMedia(file: MediaFile): Promise<MediaStorageResult> {
    this.files.set(file.filename, file.content);
    return { success: true, url: `/uploads/${file.filename}` };
  }

  async deleteMedia(filename: string): Promise<MediaStorageResult> {
    this.files.delete(filename);
    return { success: true };
  }

  hasFile(filename: string): boolean {
    return this.files.has(filename);
  }
}

/**
 * Ambient Factory that returns the appropriate MediaStorage adapter based on the runtime environment.
 */
export function getMediaStorage(locals?: App.Locals): MediaStorage {
  const githubPat =
    (env as any)?.GITHUB_PAT ||
    (locals as any)?.cfContext?.env?.GITHUB_PAT ||
    (locals as any)?.runtime?.env?.GITHUB_PAT ||
    (typeof process !== "undefined" ? process.env?.GITHUB_PAT : null);

  const adapters: MediaStorage[] = [];

  if (githubPat) {
    adapters.push(new GitHubMediaAdapter(githubPat));
  }

  if (typeof process !== "undefined" && process.versions?.node) {
    adapters.push(new LocalFsMediaAdapter());
  }

  if (adapters.length === 0) {
    // Fallback if neither is configured (e.g. testing)
    return new InMemoryMediaAdapter();
  }

  if (adapters.length === 1) {
    return adapters[0];
  }

  return new CompositeMediaAdapter(adapters);
}
