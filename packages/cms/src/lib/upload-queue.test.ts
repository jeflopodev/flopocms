import { describe, expect, it, vi } from "vitest";
import { MAX_IMAGE_SIZE, MAX_NON_IMAGE_SIZE } from "blocks/asset-rules";
import { createUploadQueue, type UploadOutcome, type UploadedAsset } from "./upload-queue";

/** A File of a given size, without allocating megabytes. */
function file(name: string, byteSize: number, mimeType = "image/png"): File {
  return { name, size: byteSize, type: mimeType } as unknown as File;
}

function assetFrom(file: File, index = 0): UploadedAsset {
  return {
    id: `asset-${index}`,
    filename: file.name,
    originalName: file.name,
    mimeType: file.type,
    byteSize: file.size,
    url: `/uploads/${file.name}`,
    title: file.name,
    altText: file.name,
  };
}

describe("Upload Queue", () => {
  it("uploads one file at a time, in the order it was given", async () => {
    const order: string[] = [];
    let inFlight = 0;
    let overlapped = false;

    const queue = createUploadQueue({
      post: async (f) => {
        inFlight += 1;
        if (inFlight > 1) overlapped = true;
        await Promise.resolve();
        inFlight -= 1;
        order.push(f.name);
        return { success: true, asset: assetFrom(f, order.length) };
      },
    });

    queue.enqueue([file("a.png", 1000), file("b.png", 1000), file("c.png", 1000)]);
    await queue.settled();

    expect(order).toEqual(["a.png", "b.png", "c.png"]);
    expect(overlapped).toBe(false);
  });

  it("refuses an oversized image without spending a request", async () => {
    const post = vi.fn(async (f: File): Promise<UploadOutcome> => ({ success: true, asset: assetFrom(f) }));
    const queue = createUploadQueue({ post });

    queue.enqueue([file("huge.png", MAX_IMAGE_SIZE + 1)]);
    await queue.settled();

    expect(post).not.toHaveBeenCalled();
    expect(queue.items()[0].status).toBe("rejected");
    expect(queue.items()[0].error).toContain("over the 2 MB limit");
  });

  it("allows a large file that is not an image, up to its own limit", async () => {
    const post = vi.fn(async (f: File): Promise<UploadOutcome> => ({ success: true, asset: assetFrom(f) }));
    const queue = createUploadQueue({ post });

    queue.enqueue([file("clip.mp4", MAX_IMAGE_SIZE + 1, "video/mp4")]);
    await queue.settled();

    expect(post).toHaveBeenCalledTimes(1);
    expect(queue.items()[0].status).toBe("done");

    queue.enqueue([file("archive.zip", MAX_NON_IMAGE_SIZE + 1, "application/zip")]);
    await queue.settled();

    expect(queue.items()[1].status).toBe("rejected");
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("keeps a failure in the queue with its reason, and lets it be retried", async () => {
    let attempt = 0;
    const queue = createUploadQueue({
      post: async (f) => {
        attempt += 1;
        return attempt === 1
          ? { success: false, error: "Storage is unavailable." }
          : { success: true, asset: assetFrom(f) };
      },
    });

    queue.enqueue([file("flaky.png", 500)]);
    await queue.settled();

    expect(queue.items()[0]).toMatchObject({ status: "failed", error: "Storage is unavailable." });

    await queue.retry(queue.items()[0].id);

    expect(queue.items()[0]).toMatchObject({ status: "done" });
    expect(queue.items()[0].error).toBeUndefined();
    expect(queue.items()[0].asset?.url).toBe("/uploads/flaky.png");
  });

  it("will not retry a rejection, because the file has not changed", async () => {
    const post = vi.fn(async (f: File): Promise<UploadOutcome> => ({ success: true, asset: assetFrom(f) }));
    const queue = createUploadQueue({ post });

    queue.enqueue([file("huge.png", MAX_IMAGE_SIZE + 1)]);
    await queue.settled();
    await queue.retry(queue.items()[0].id);

    expect(post).not.toHaveBeenCalled();
  });

  it("reports the whole queue on every change", async () => {
    const seen: string[] = [];
    const queue = createUploadQueue({
      post: async (f) => ({ success: true, asset: assetFrom(f) }),
      onChange: (items) => seen.push(items.map((i) => i.status).join(",")),
    });

    queue.enqueue([file("a.png", 100), file("b.png", 100)]);
    await queue.settled();

    // queued,queued → uploading,queued → done,queued → done,uploading → done,done
    expect(seen).toEqual(["queued,queued", "uploading,queued", "done,queued", "done,uploading", "done,done"]);
  });

  it("forgets a dismissed item without touching the ones still uploading", async () => {
    const queue = createUploadQueue({ post: async (f) => ({ success: true, asset: assetFrom(f) }) });

    queue.enqueue([file("a.png", 100), file("b.png", 100)]);
    await queue.settled();
    queue.dismiss(queue.items()[0].id);

    expect(queue.items().map((i) => i.filename)).toEqual(["b.png"]);
  });

  it("runs prepare before the verdict, so a converted file is judged as itself", async () => {
    const seen: string[] = [];
    const queue = createUploadQueue({
      post: async (f) => {
        seen.push(`${f.name}:${f.type}`);
        return { success: true, asset: assetFrom(f) };
      },
      prepare: async (f) => new File([f], "photo.webp", { type: "image/webp" }) as unknown as File,
    });

    queue.enqueue([file("photo.png", 100)]);
    await queue.settled();

    expect(seen).toEqual(["photo.webp:image/webp"]);
    expect(queue.items()[0]).toMatchObject({ status: "done", filename: "photo.webp" });
  });

  it("keeps the original when prepare throws; the server retries", async () => {
    const seen: string[] = [];
    const queue = createUploadQueue({
      post: async (f) => {
        seen.push(f.name);
        return { success: true, asset: assetFrom(f) };
      },
      prepare: async () => {
        throw new Error("canvas unavailable");
      },
    });

    queue.enqueue([file("photo.png", 100)]);
    await queue.settled();

    expect(seen).toEqual(["photo.png"]);
    expect(queue.items()[0].status).toBe("done");
  });
});
