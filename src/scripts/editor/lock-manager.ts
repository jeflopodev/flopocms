export interface LockManagerOptions {
  postId: string;
  isInitiallyLocked: boolean;
  lockUser?: string;
  onReadOnlyChanged: (isReadOnly: boolean, lockedBy: string) => void;
}

export class LockManager {
  private postId: string;
  private isReadOnly: boolean;
  private heartbeatTimer: any = null;
  private onReadOnlyChanged: (isReadOnly: boolean, lockedBy: string) => void;

  constructor(options: LockManagerOptions) {
    this.postId = options.postId;
    this.isReadOnly = options.isInitiallyLocked;
    this.onReadOnlyChanged = options.onReadOnlyChanged;

    if (this.isReadOnly) {
      this.setReadOnly(options.lockUser || "another editor");
    } else {
      this.startHeartbeat();
    }

    this.registerExitHandlers();
  }

  public getReadOnly(): boolean {
    return this.isReadOnly;
  }

  public setReadOnly(lockedBy: string): void {
    this.isReadOnly = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    const banner = document.getElementById("lock-warning-banner");
    const bannerText = document.getElementById("lock-warning-text");
    if (banner) banner.classList.remove("hidden");
    if (bannerText) {
      bannerText.textContent = `Article is currently being edited by @${lockedBy}. You are in Read-Only mode.`;
    }

    const disableIds = [
      "manual-save-btn",
      "topbar-status-select",
      "topbar-title-input",
      "post-status-select",
    ];
    disableIds.forEach((id) => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLButtonElement | HTMLSelectElement;
      if (el) el.disabled = true;
    });

    this.onReadOnlyChanged(true, lockedBy);
  }

  public startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(async () => {
      if (this.isReadOnly) return;
      try {
        await fetch("/api/admin/posts/lock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId: this.postId, action: "renew" }),
        });
      } catch (err) {
        console.warn("Lock heartbeat error:", err);
      }
    }, 20000);
  }

  public releaseLockImmediately(): void {
    if (this.isReadOnly) return;
    const releaseUrl = `/api/admin/posts/lock?postId=${encodeURIComponent(this.postId)}&action=release`;
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
