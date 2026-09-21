/**
 * Editor Session.
 *
 * Owns the editor's state — unsaved changes, the in-flight save, the editorial status,
 * and whether another Editor holds the Concurrency Lock — and exposes it as a snapshot
 * that adapters render from.
 *
 * It touches no DOM and no network: the CodeMirror adapter reads the body, the DOM
 * adapter reads the metadata fields and renders, and the lock client reports conflicts.
 * That is what makes the transitions below testable without a browser.
 */

import type { ArticleWriteModel, EditableArticleFields } from "../../lib/article-write-model";

export type SaveTarget = "draft" | "published";

/** The save lifecycle. Read-only is a flag beside this, not a phase of it. */
export type SessionPhase = "idle" | "dirty" | "saving" | "saved" | "error";

export interface SaveOutcome {
  ok: boolean;
  /** HTTP status, so the session can recognise a Concurrency Lock conflict. */
  status?: number;
  /** Who holds the lock, when the server says so. */
  lockedBy?: string;
  slug?: string;
  statusState?: SaveTarget;
  message?: string;
  error?: string;
}

export interface SessionSnapshot {
  phase: SessionPhase;
  status: SaveTarget;
  slug: string;
  readOnly: boolean;
  lockedBy?: string;
  message: string;
}

export interface EditorSessionOptions {
  postId: string;
  initialSlug: string;
  initialStatus: SaveTarget;
  initialReadOnly?: boolean;
  initialLockedBy?: string;
  /** Reads the Article body. Supplied by the CodeMirror adapter. */
  readContent: () => string;
  /** Reads the metadata fields. Supplied by the DOM adapter. */
  readMetadata: () => EditableArticleFields;
  /** Persists the Article. Rejections are treated as transport errors. */
  persist: (payload: ArticleWriteModel) => Promise<SaveOutcome>;
}

export class EditorSession {
  private phase: SessionPhase = "idle";
  private status: SaveTarget;
  private slug: string;
  private readOnly: boolean;
  private lockedBy?: string;
  private message = "Saved to D1";
  private listeners = new Set<(snapshot: SessionSnapshot) => void>();

  constructor(private readonly options: EditorSessionOptions) {
    this.status = options.initialStatus;
    this.slug = options.initialSlug;
    this.readOnly = Boolean(options.initialReadOnly);
    this.lockedBy = options.initialLockedBy;
  }

  subscribe(listener: (snapshot: SessionSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): SessionSnapshot {
    return {
      phase: this.phase,
      status: this.status,
      slug: this.slug,
      readOnly: this.readOnly,
      lockedBy: this.lockedBy,
      message: this.message,
    };
  }

  get isReadOnly(): boolean {
    return this.readOnly;
  }

  get currentStatus(): SaveTarget {
    return this.status;
  }

  get hasUnsavedChanges(): boolean {
    return this.phase === "dirty" || this.phase === "error";
  }

  /** Editing text or metadata. Ignored while another Editor holds the lock. */
  markDirty(): void {
    if (this.readOnly || this.phase === "saving") return;
    this.set("dirty", "Cambios sin guardar");
  }

  /** Ctrl+S and the action buttons. Defaults to the Article's current status. */
  async saveRequested(target: SaveTarget = this.status): Promise<void> {
    if (this.readOnly || this.phase === "saving") return;

    // The Article Write Model, composed from its three owners: the Settings Panel's
    // fields, the body, and the status the Editor asked for.
    const payload: ArticleWriteModel = {
      ...this.options.readMetadata(),
      id: this.options.postId,
      content_mdx: this.options.readContent(),
      status: target,
    };

    this.set("saving", target === "published" ? "Publicando en GitHub & D1..." : "Guardando en D1...");

    let outcome: SaveOutcome;
    try {
      outcome = await this.options.persist(payload);
    } catch {
      this.set("error", "Error de red");
      return;
    }

    if (outcome.ok) {
      this.status = outcome.statusState || target;
      this.slug = outcome.slug || this.slug;
      this.set(
        "saved",
        outcome.message || (this.status === "published" ? "Publicado en GitHub & D1" : "Borrador guardado en D1")
      );
      return;
    }

    if (outcome.status === 423) {
      // The save was refused because someone else is editing. Keep the unsaved work.
      this.lockConflict(outcome.lockedBy);
      return;
    }

    this.set("error", outcome.error || "Error al guardar");
  }

  /** Another Editor acquired the Concurrency Lock. Unsaved work is preserved. */
  lockConflict(lockedBy?: string): void {
    this.readOnly = true;
    this.lockedBy = lockedBy;
    this.set(this.phase === "saving" ? "dirty" : this.phase, "Bloqueado por otro Editor");
  }

  /** The Concurrency Lock is free again. Unsaved work stays unsaved. */
  lockAcquired(): void {
    this.readOnly = false;
    this.lockedBy = undefined;
    this.emit();
  }

  private set(phase: SessionPhase, message: string): void {
    this.phase = phase;
    this.message = message;
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
