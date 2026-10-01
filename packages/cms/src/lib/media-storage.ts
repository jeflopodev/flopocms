import type { GithubContents } from "./github-contents";

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
  /** Reads raw bytes back, or null when the file is absent. */
  readMedia(filename: string): Promise<Uint8Array | null>;
}

export class GitHubMediaAdapter implements MediaStorage {
  /**
   * @param uploadsDir Repo-relative asset base on `main` (per site, via
   * `Services.uploadsDir`). Uploads land in the global Asset Registry path,
   * so every Article can reference them.
   */
  constructor(
    private readonly contents: GithubContents,
    private readonly uploadsDir: string
  ) {}

  private get prefix(): string {
    const base = this.uploadsDir.replace(/\/+$/, "");
    return `${base}/`;
  }

  async writeMedia(file: MediaFile): Promise<MediaStorageResult> {
    const res = await this.contents.putFile(`${this.prefix}${file.filename}`, file.content, {
      // Assets are not content: skip the production build they would otherwise trigger.
      message: `media(global): upload ${file.filename} [skip ci]`,
    });

    if (!res.success) {
      return { success: false, error: res.error || "Failed to commit media to GitHub" };
    }
    return { success: true, url: `/uploads/${file.filename}` };
  }

  async deleteMedia(filename: string): Promise<MediaStorageResult> {
    const res = await this.contents.deleteFile(`${this.prefix}${filename}`, {
      message: `media(global): delete ${filename}`,
    });
    return { success: res.success, error: res.error };
  }

  async readMedia(filename: string): Promise<Uint8Array | null> {
    const res = await this.contents.readBytes(`${this.prefix}${filename}`);
    return res?.bytes ?? null;
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

  async readMedia(filename: string): Promise<Uint8Array | null> {
    if (typeof process === "undefined" || !process.versions?.node) {
      return null;
    }

    try {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const uploadsDir = await this.getUploadsDir();
      const filePath = path.join(uploadsDir, filename);

      if (!fs.existsSync(filePath)) return null;
      return new Uint8Array(fs.readFileSync(filePath));
    } catch (err: any) {
      console.warn("Local filesystem read error:", err);
      return null;
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

  async readMedia(filename: string): Promise<Uint8Array | null> {
    for (const adapter of this.adapters) {
      const bytes = await adapter.readMedia(filename);
      if (bytes) return bytes;
    }
    return null;
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

  async readMedia(filename: string): Promise<Uint8Array | null> {
    return this.files.get(filename) ?? null;
  }

  hasFile(filename: string): boolean {
    return this.files.has(filename);
  }
}

/**
 * Selects the Media Storage adapters for the runtime environment.
 * GitHub storage is used only when a Contents module is available; local disk is
 * used only when a Node filesystem exists. Both means: keep them in step.
 */
export function getMediaStorage(contents: GithubContents | null, uploadsDir: string): MediaStorage {
  const adapters: MediaStorage[] = [];

  if (contents) {
    adapters.push(new GitHubMediaAdapter(contents, uploadsDir));
  }

  if (typeof process !== "undefined" && process.versions?.node) {
    adapters.push(new LocalFsMediaAdapter());
  }

  if (adapters.length === 0) {
    // Neither configured: a local substitute keeps callers working.
    return new InMemoryMediaAdapter();
  }

  if (adapters.length === 1) {
    return adapters[0];
  }

  return new CompositeMediaAdapter(adapters);
}
