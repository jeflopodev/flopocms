import { sizeVerdictFor } from "blocks/asset-rules";

/**
 * Upload Queue.
 *
 * Both places that accept files — the editor's Asset Modal and the Asset Library page —
 * show the same thing: what is uploading, what finished, and what the server refused. They
 * used to each hand-roll a sequential `for` loop with `alert()` on failure, so a failure
 * was a dialog nobody could read twice and a retry meant picking the file again.
 *
 * This module holds no DOM and does no fetching of its own: it takes a `post` transport,
 * which is what lets its ordering, refusal and failure rules be tested without a browser.
 */

/** An asset as the Asset Registry route returns it. */
export interface UploadedAsset {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  url: string;
  title: string;
  altText: string;
}

export type UploadOutcome =
  | { success: true; asset: UploadedAsset }
  | { success: false; error: string };

export type UploadStatus = "queued" | "rejected" | "uploading" | "done" | "failed";

export interface UploadItem {
  id: string;
  file: File;
  filename: string;
  byteSize: number;
  mimeType: string;
  status: UploadStatus;
  /** Why it was refused or failed, ready to show. */
  error?: string;
  /** The created record, once the server has accepted it. */
  asset?: UploadedAsset;
}

export interface UploadQueueOptions {
  /** How one file becomes an asset. The real one posts to the Asset Registry route. */
  post: (file: File) => Promise<UploadOutcome>;
  /** Called after every change, with the whole queue. */
  onChange?: (items: readonly UploadItem[]) => void;
}

export interface UploadQueue {
  /**
   * Takes files, refuses the ones over their own limit without spending a request, and
   * uploads the rest one at a time in the order given.
   */
  enqueue(files: Iterable<File>): void;
  /** Re-posts a failed item. A rejected one stays rejected: the file is simply too big. */
  retry(id: string): Promise<void>;
  /** Forgets an item, once the host has shown it and the editor is done with it. */
  dismiss(id: string): void;
  items(): readonly UploadItem[];
  /** Resolves when nothing is left uploading. */
  settled(): Promise<void>;
}

export function createUploadQueue(options: UploadQueueOptions): UploadQueue {
  const items: UploadItem[] = [];
  let running: Promise<void> = Promise.resolve();
  let counter = 0;

  const notify = () => options.onChange?.(items);

  async function upload(item: UploadItem): Promise<void> {
    item.status = "uploading";
    item.error = undefined;
    notify();

    const outcome = await options.post(item.file);

    if (outcome.success) {
      item.status = "done";
      item.asset = outcome.asset;
    } else {
      item.status = "failed";
      item.error = outcome.error;
    }
    notify();
  }

  /** One at a time, in order: a queue that finishes out of order is unreadable. */
  function queue(item: UploadItem): Promise<void> {
    running = running.then(() => upload(item));
    return running;
  }

  return {
    enqueue(files) {
      for (const file of files) {
        const verdict = sizeVerdictFor({
          mimeType: file.type,
          byteSize: file.size,
          filename: file.name,
        });

        const item: UploadItem = {
          id: `upload-${++counter}`,
          file,
          filename: file.name,
          byteSize: file.size,
          mimeType: file.type,
          status: verdict.ok ? "queued" : "rejected",
          error: verdict.reason,
        };

        items.push(item);
        if (verdict.ok) queue(item);
      }
      notify();
    },

    async retry(id) {
      const item = items.find((candidate) => candidate.id === id);
      if (!item || item.status === "done" || item.status === "rejected") return;
      await queue(item);
    },

    dismiss(id) {
      const index = items.findIndex((candidate) => candidate.id === id);
      if (index === -1) return;
      items.splice(index, 1);
      notify();
    },

    items: () => items,
    settled: () => running,
  };
}

/**
 * The real transport: one file to the Asset Registry route. Failures come back as values
 * rather than exceptions, so the queue has one path for "the server said no" and "the
 * server could not be reached".
 */
export async function postAssetFile(file: File): Promise<UploadOutcome> {
  try {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/admin/assets/upload", { method: "POST", body: formData });
    const data = (await res.json()) as any;

    if (!data?.success) {
      return { success: false, error: data?.error || "Upload failed." };
    }

    return {
      success: true,
      asset: {
        id: data.assetId,
        filename: data.filename,
        originalName: data.originalName || file.name,
        mimeType: data.mimeType || file.type,
        byteSize: data.byteSize || file.size,
        url: data.url,
        title: data.title || data.filename,
        altText: data.altText || data.filename,
      },
    };
  } catch {
    return { success: false, error: "Error contacting the server." };
  }
}
