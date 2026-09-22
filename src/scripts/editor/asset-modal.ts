import { insertionForAsset } from "../../blocks/insertion";
import {
  createUploadQueue,
  postAssetFile,
  type UploadItem,
  type UploadedAsset,
} from "../../lib/upload-queue";

export interface AssetPickerModalOptions {
  initialAssets: any[];
  onInsertSnippet?: (snippet: string) => void;
  onSetFeaturedImage?: (url: string) => void;
}

/**
 * Asset Picker Modal.
 *
 * Owns only the asset selection dialog (`#editor-asset-modal`), asset searching,
 * tab switching between the library and upload dropzone, and the upload queue.
 */
export class AssetPickerModal {
  private allAssets: any[];
  private onInsertSnippet?: (snippet: string) => void;
  private onSetFeaturedImage?: (url: string) => void;

  private pickerTarget: "editor" | "featured" = "editor";
  private pickedAsset: any = null;

  // DOM Elements
  private assetModal = document.getElementById("editor-asset-modal") as HTMLDialogElement | null;
  private openAssetModalBtn = document.getElementById("open-asset-modal-btn");
  private browseHeroImageBtn = document.getElementById("browse-hero-image-btn");
  private closeAssetModalBtn = document.getElementById("close-asset-modal-btn");
  private cancelAssetModalBtn = document.getElementById("cancel-asset-modal-btn");
  private confirmAssetModalBtn = document.getElementById("confirm-asset-modal-btn") as HTMLButtonElement | null;
  private modalSearchInput = document.getElementById("modal-asset-search") as HTMLInputElement | null;
  private modalAssetsGrid = document.getElementById("modal-assets-grid");
  private selectedAssetInfo = document.getElementById("selected-asset-info");
  private modalDropzone = document.getElementById("modal-dropzone");
  private modalFileInput = document.getElementById("modal-file-input") as HTMLInputElement | null;
  private modalUploadStatus = document.getElementById("modal-upload-status");
  private modalTabBtns = document.querySelectorAll(".modal-tab-btn");

  /** Files dropped into the modal, through the same upload queue the Asset Library uses. */
  private uploads = createUploadQueue({
    post: postAssetFile,
    onChange: (items) => this.onUploadChange(items),
  });
  private insertedUploads = new Set<string>();

  constructor(options: AssetPickerModalOptions) {
    this.allAssets = [...options.initialAssets];
    this.onInsertSnippet = options.onInsertSnippet;
    this.onSetFeaturedImage = options.onSetFeaturedImage;

    this.initEventListeners();
  }

  public open(target: "editor" | "featured"): void {
    if (!this.assetModal) return;
    this.pickerTarget = target;
    this.pickedAsset = null;

    if (this.modalUploadStatus) this.modalUploadStatus.textContent = "";
    if (this.confirmAssetModalBtn) {
      this.confirmAssetModalBtn.disabled = true;
      this.confirmAssetModalBtn.textContent =
        target === "featured" ? "Set as Featured Image" : "Insert into Article";
    }
    if (this.selectedAssetInfo) {
      this.selectedAssetInfo.innerHTML = `<span class="placeholder-text">Click an asset to select it</span>`;
    }

    this.switchModalTab("library");
    this.renderModalAssets();
    this.assetModal.showModal();
  }

  public close(): void {
    this.assetModal?.close();
  }

  private initEventListeners(): void {
    this.openAssetModalBtn?.addEventListener("click", () => this.open("editor"));
    this.browseHeroImageBtn?.addEventListener("click", () => this.open("featured"));

    this.closeAssetModalBtn?.addEventListener("click", () => this.close());
    this.cancelAssetModalBtn?.addEventListener("click", () => this.close());

    this.modalTabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = (btn as HTMLElement).dataset.tab as "library" | "upload";
        this.switchModalTab(tab);
      });
    });

    this.modalSearchInput?.addEventListener("input", () => this.renderModalAssets());

    this.confirmAssetModalBtn?.addEventListener("click", () => {
      if (!this.pickedAsset) return;

      if (this.pickerTarget === "featured") {
        this.onSetFeaturedImage?.(this.pickedAsset.url);
      } else {
        this.onInsertSnippet?.(
          `\n${insertionForAsset({
            url: this.pickedAsset.url,
            mimeType: this.pickedAsset.mimeType,
            label: this.pickedAsset.altText || this.pickedAsset.title,
            filename: this.pickedAsset.filename,
          })}\n`
        );
      }
      this.close();
    });

    this.modalDropzone?.addEventListener("click", () => this.modalFileInput?.click());
    this.modalDropzone?.addEventListener("dragover", (e) => {
      e.preventDefault();
      this.modalDropzone?.classList.add("dragover");
    });
    this.modalDropzone?.addEventListener("dragleave", () => {
      this.modalDropzone?.classList.remove("dragover");
    });
    this.modalDropzone?.addEventListener("drop", (e) => {
      e.preventDefault();
      this.modalDropzone?.classList.remove("dragover");
      if (e.dataTransfer?.files?.length) {
        this.uploads.enqueue(e.dataTransfer.files);
      }
    });

    this.modalFileInput?.addEventListener("change", () => {
      if (this.modalFileInput?.files?.length) {
        this.uploads.enqueue(this.modalFileInput.files);
      }
      if (this.modalFileInput) this.modalFileInput.value = "";
    });
  }

  private switchModalTab(tab: "library" | "upload"): void {
    this.modalTabBtns.forEach((b) => {
      const btn = b as HTMLElement;
      if (btn.dataset.tab === tab) btn.classList.add("active");
      else btn.classList.remove("active");
    });

    const libPane = document.getElementById("tab-library-content");
    const uploadPane = document.getElementById("tab-upload-content");
    if (tab === "library") {
      libPane?.classList.add("active");
      uploadPane?.classList.remove("active");
    } else {
      uploadPane?.classList.add("active");
      libPane?.classList.remove("active");
    }
  }

  private renderModalAssets(): void {
    if (!this.modalAssetsGrid) return;
    const q = this.modalSearchInput?.value.trim().toLowerCase() || "";
    const filtered = this.allAssets.filter((a: any) => {
      if (!q) return true;
      return a.filename.toLowerCase().includes(q) || (a.title && a.title.toLowerCase().includes(q));
    });

    if (filtered.length === 0) {
      this.modalAssetsGrid.innerHTML = `<div class="modal-empty-state"><p>No assets found</p></div>`;
      return;
    }

    this.modalAssetsGrid.innerHTML = "";
    for (const a of filtered) {
      const card = document.createElement("div");
      card.className = `modal-asset-item ${this.pickedAsset?.id === a.id ? "selected" : ""}`;

      let thumb = "";
      if (a.mimeType.startsWith("image/")) {
        thumb = `<img src="${a.url}" alt="${a.filename}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'file-icon-badge\\'><span>IMG</span></div>';" />`;
      } else {
        thumb = `
          <div class="file-icon-badge">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span>${a.filename.split(".").pop()?.toUpperCase() || "FILE"}</span>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="modal-asset-thumb">${thumb}</div>
        <span class="modal-asset-name" title="${a.filename}">${a.filename}</span>
      `;

      card.addEventListener("click", () => {
        document.querySelectorAll(".modal-asset-item").forEach((el) => el.classList.remove("selected"));
        card.classList.add("selected");
        this.pickedAsset = a;
        if (this.confirmAssetModalBtn) this.confirmAssetModalBtn.disabled = false;
        if (this.selectedAssetInfo) {
          this.selectedAssetInfo.innerHTML = `<strong>Selected:</strong> <span>${a.filename}</span>`;
        }
      });

      this.modalAssetsGrid.appendChild(card);
    }
  }

  private onUploadChange(items: readonly UploadItem[]): void {
    for (const item of items) {
      if (item.status !== "done" || !item.asset || this.insertedUploads.has(item.id)) continue;
      this.insertedUploads.add(item.id);
      this.acceptUploadedAsset(item.asset);
    }

    this.renderUploadStatus(items);
  }

  private acceptUploadedAsset(asset: UploadedAsset): void {
    this.allAssets.unshift({ ...asset, description: "" });

    if (this.pickerTarget === "featured") {
      this.onSetFeaturedImage?.(asset.url);
      return;
    }

    this.onInsertSnippet?.(
      `\n${insertionForAsset({
        url: asset.url,
        mimeType: asset.mimeType,
        label: asset.altText,
        filename: asset.filename,
      })}\n`
    );
    this.renderModalAssets();
  }

  private renderUploadStatus(items: readonly UploadItem[]): void {
    if (!this.modalUploadStatus) return;

    const active = items.find((item) => item.status === "uploading" || item.status === "queued");
    if (active) {
      this.modalUploadStatus.textContent =
        active.status === "uploading" ? `Uploading ${active.filename}...` : "Preparing upload...";
      return;
    }

    const refused = items.filter((item) => item.status === "failed" || item.status === "rejected");
    if (refused.length > 0) {
      const reason = refused[0].error || "Upload failed.";
      this.modalUploadStatus.textContent =
        refused.length === 1 ? reason : `${refused.length} files were not uploaded. ${reason}`;
      return;
    }

    this.modalUploadStatus.textContent = items.some((item) => item.status === "done")
      ? "Upload complete and inserted."
      : "";
  }
}
