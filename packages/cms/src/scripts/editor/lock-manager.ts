/**
 * Lock client adapter.
 *
 * Owns the Concurrency Lock conversation with the server: renewing it on a heartbeat
 * and releasing it the moment the editor leaves. It reports what it learns to the
 * Editor Session and renders nothing — the DOM adapter draws the banner from the
 * session's snapshot.
 */

export interface LockManagerOptions {
  postId: string;
  initiallyLocked: boolean;
  lockUser?: string;
  /** The Concurrency Lock is held by someone else. */
  onConflict: (lockedBy?: string) => void;
  isReadOnly: () => boolean;
}

export class LockManager {
  private heartbeatTimer: any = null;

  constructor(private readonly options: LockManagerOptions) {
    if (options.initiallyLocked) {
      options.onConflict(options.lockUser);
    } else {
      this.startHeartbeat();
    }

    this.registerExitHandlers();
  }

  public startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(async () => {
      if (this.options.isReadOnly()) return;
      try {
        await fetch("/api/admin/posts/lock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId: this.options.postId, action: "renew" }),
        });
      } catch (err) {
        console.warn("Lock heartbeat error:", err);
      }
    }, 20000);
  }

  public releaseLockImmediately(): void {
    if (this.options.isReadOnly()) return;
    const releaseUrl = `/api/admin/posts/lock?postId=${encodeURIComponent(this.options.postId)}&action=release`;
    if (navigator.sendBeacon) {
      navigator.sendBeacon(releaseUrl);
    } else {
      fetch(releaseUrl, { method: "POST", keepalive: true }).catch(() => {});
    }
  }

  private registerExitHandlers(): void {
    const release = () => this.releaseLockImmediately();
    window.addEventListener("pagehide", release);
    window.addEventListener("beforeunload", release);
    document.querySelector(".back-link")?.addEventListener("click", release);
  }
}
