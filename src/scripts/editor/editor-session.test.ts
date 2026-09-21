import { describe, expect, it, vi } from "vitest";
import { EditorSession, type SaveOutcome, type SessionSnapshot } from "./editor-session";
import type { EditableArticleFields } from "../../lib/article-write-model";

function metadata(): EditableArticleFields {
  return {
    slug: "untitled",
    title: "Untitled Article",
    description: "",
    category: "General",
    tags: [],
    author: "jeflopo",
    featured_image: "",
    template: "default",
    default_width: "60rem",
    wide_width: "70rem",
  };
}

function sessionWith(
  persist: (payload: any) => Promise<SaveOutcome>,
  overrides: Partial<ConstructorParameters<typeof EditorSession>[0]> = {}
) {
  return new EditorSession({
    postId: "post-1",
    initialSlug: "untitled",
    initialStatus: "draft",
    readContent: () => "<Paragraph>Body</Paragraph>",
    readMetadata: metadata,
    persist,
    ...overrides,
  });
}

const saved: SaveOutcome = { ok: true, slug: "untitled", statusState: "draft", message: "Borrador guardado en D1" };

describe("Editor Session phases", () => {
  it("starts idle with no unsaved changes", () => {
    const session = sessionWith(async () => saved);
    expect(session.getSnapshot()).toMatchObject({ phase: "idle", status: "draft", readOnly: false });
    expect(session.hasUnsavedChanges).toBe(false);
  });

  it("goes dirty when the document changes", () => {
    const session = sessionWith(async () => saved);
    session.markDirty();
    expect(session.getSnapshot().phase).toBe("dirty");
    expect(session.hasUnsavedChanges).toBe(true);
  });

  it("reports saving, then saved, and clears the unsaved flag", async () => {
    let release: (o: SaveOutcome) => void = () => {};
    const session = sessionWith(() => new Promise<SaveOutcome>((resolve) => (release = resolve)));

    session.markDirty();
    const pending = session.saveRequested();
    expect(session.getSnapshot()).toMatchObject({ phase: "saving", message: "Guardando en D1..." });

    release(saved);
    await pending;

    expect(session.getSnapshot()).toMatchObject({ phase: "saved", message: "Borrador guardado en D1" });
    expect(session.hasUnsavedChanges).toBe(false);
  });

  it("announces publishing when the target is published", async () => {
    const session = sessionWith(() => new Promise<SaveOutcome>(() => {}));
    void session.saveRequested("published");
    expect(session.getSnapshot().message).toBe("Publicando en GitHub & D1...");
  });

  it("adopts the status and slug the server returns", async () => {
    const session = sessionWith(async () => ({ ok: true, slug: "renamed-article", statusState: "published" }));
    await session.saveRequested("published");
    expect(session.getSnapshot()).toMatchObject({ status: "published", slug: "renamed-article" });
  });

  it("saves against the current status when no target is given", async () => {
    const persist = vi.fn(async () => saved);
    const session = sessionWith(persist, { initialStatus: "published" });

    await session.saveRequested();

    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ status: "published" }));
  });

  it("keeps unsaved changes and reports an error when the transport fails", async () => {
    const session = sessionWith(async () => {
      throw new Error("offline");
    });

    session.markDirty();
    await session.saveRequested();

    expect(session.getSnapshot()).toMatchObject({ phase: "error", message: "Error de red" });
    expect(session.hasUnsavedChanges).toBe(true);
  });

  it("reports the server's error message when the save is rejected", async () => {
    const session = sessionWith(async () => ({ ok: false, status: 409, error: "Slug already used" }));
    await session.saveRequested();
    expect(session.getSnapshot()).toMatchObject({ phase: "error", message: "Slug already used" });
  });

  it("ignores a second save while one is in flight", async () => {
    const persist = vi.fn(() => new Promise<SaveOutcome>(() => {}));
    const session = sessionWith(persist);

    void session.saveRequested();
    await session.saveRequested();

    expect(persist).toHaveBeenCalledTimes(1);
  });
});

describe("Concurrency Lock conflicts", () => {
  it("enters read-only without discarding unsaved work", async () => {
    const session = sessionWith(async () => ({ ok: false, status: 423, lockedBy: "aflopo" }));

    session.markDirty();
    await session.saveRequested();

    expect(session.getSnapshot()).toMatchObject({ readOnly: true, lockedBy: "aflopo", phase: "dirty" });
    expect(session.hasUnsavedChanges).toBe(true);
  });

  it("refuses edits and saves while read-only", async () => {
    const persist = vi.fn(async () => saved);
    const session = sessionWith(persist, { initialReadOnly: true, initialLockedBy: "aflopo" });

    session.markDirty();
    await session.saveRequested();

    expect(session.getSnapshot().phase).toBe("idle");
    expect(persist).not.toHaveBeenCalled();
  });

  it("allows editing again once the lock is free", async () => {
    const session = sessionWith(async () => saved, { initialReadOnly: true, initialLockedBy: "aflopo" });

    session.lockAcquired();
    expect(session.getSnapshot()).toMatchObject({ readOnly: false, lockedBy: undefined });

    session.markDirty();
    expect(session.getSnapshot().phase).toBe("dirty");
  });

  it("uses a placeholder when the server does not name the lock holder", async () => {
    const session = sessionWith(async () => ({ ok: false, status: 423 }));
    await session.saveRequested();
    expect(session.getSnapshot()).toMatchObject({ readOnly: true, lockedBy: undefined });
  });
});

describe("Subscribers", () => {
  it("receives the current snapshot immediately and every change after", () => {
    const session = sessionWith(async () => saved);
    const seen: SessionSnapshot[] = [];

    const unsubscribe = session.subscribe((snapshot) => seen.push(snapshot));
    session.markDirty();
    session.lockConflict("aflopo");
    unsubscribe();
    session.markDirty();

    expect(seen.map((s) => s.phase)).toEqual(["idle", "dirty", "dirty"]);
    expect(seen[seen.length - 1].readOnly).toBe(true);
  });
});
