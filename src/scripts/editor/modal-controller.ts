export interface ModalControllerOptions {
  initialAssets: any[];
  insertSnippet: (snippet: string) => void;
  applyFormatting: (tool: string) => void;
  onAssetPickedForHero: (url: string) => void;
}

export class ModalController {
  private allAssets: any[];
  private insertSnippet: (snippet: string) => void;
  private applyFormatting: (tool: string) => void;
  private onAssetPickedForHero: (url: string) => void;

  private activePanel: "settings" | "blocks" | "none" = "settings";
  private pickerTarget: "editor" | "featured" = "editor";
  private pickedAsset: any = null;

  // DOM Elements
  private drawer = document.getElementById("editor-drawer");
  private drawerHeading = document.getElementById("drawer-heading");
  private drawerCloseBtn = document.getElementById("drawer-close-btn");
  private toggleSettingsBtn = document.getElementById("toggle-settings-btn");
  private toggleBlocksBtn = document.getElementById("toggle-blocks-btn");
  private settingsPanel = document.getElementById("settings-panel-content");
  private blocksPanel = document.getElementById("blocks-panel-content");

  private assetModal = document.getElementById("editor-asset-modal") as HTMLDialogElement;
  private openAssetModalBtn = document.getElementById("open-asset-modal-btn");
  private browseHeroImageBtn = document.getElementById("browse-hero-image-btn");
  private closeAssetModalBtn = document.getElementById("close-asset-modal-btn");
  private cancelAssetModalBtn = document.getElementById("cancel-asset-modal-btn");
  private confirmAssetModalBtn = document.getElementById("confirm-asset-modal-btn") as HTMLButtonElement;
  private modalSearchInput = document.getElementById("modal-asset-search") as HTMLInputElement;
  private modalAssetsGrid = document.getElementById("modal-assets-grid");
  private selectedAssetInfo = document.getElementById("selected-asset-info");
  private modalDropzone = document.getElementById("modal-dropzone");
  private modalFileInput = document.getElementById("modal-file-input") as HTMLInputElement;
  private modalUploadStatus = document.getElementById("modal-upload-status");
  private modalTabBtns = document.querySelectorAll(".modal-tab-btn");
  private postCategoryField = document.getElementById("post-category-field") as unknown as HTMLSelectElement;

  constructor(options: ModalControllerOptions) {
    this.allAssets = [...options.initialAssets];
    this.insertSnippet = options.insertSnippet;
    this.applyFormatting = options.applyFormatting;
    this.onAssetPickedForHero = options.onAssetPickedForHero;

    this.initDrawerListeners();
    this.initToolbarListeners();
    this.initBlockInsertionListeners();
    this.initAssetModalListeners();
  }

  public setPanel(panel: "settings" | "blocks" | "none"): void {
    this.activePanel = panel;
    if (panel === "none") {
      this.drawer?.classList.remove("open");
      this.toggleSettingsBtn?.classList.remove("active");
      this.toggleBlocksBtn?.classList.remove("active");
    } else if (panel === "settings") {
      this.drawer?.classList.add("open");
      this.settingsPanel?.classList.add("active");
      this.blocksPanel?.classList.remove("active");
      if (this.drawerHeading) this.drawerHeading.textContent = "Article Settings";
      this.toggleSettingsBtn?.classList.add("active");
      this.toggleBlocksBtn?.classList.remove("active");
    } else if (panel === "blocks") {
      this.drawer?.classList.add("open");
      this.blocksPanel?.classList.add("active");
      this.settingsPanel?.classList.remove("active");
      if (this.drawerHeading) this.drawerHeading.textContent = "Component Blocks";
      this.toggleBlocksBtn?.classList.add("active");
      this.toggleSettingsBtn?.classList.remove("active");
    }
  }

  private initDrawerListeners(): void {
    this.toggleSettingsBtn?.addEventListener("click", () => {
      this.setPanel(this.activePanel === "settings" ? "none" : "settings");
    });

    this.toggleBlocksBtn?.addEventListener("click", () => {
      this.setPanel(this.activePanel === "blocks" ? "none" : "blocks");
    });

    this.drawerCloseBtn?.addEventListener("click", () => {
      this.setPanel("none");
    });
  }

  private initToolbarListeners(): void {
    document.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tool = (btn as HTMLElement).dataset.tool;
        if (tool) this.applyFormatting(tool);
      });
    });
  }

  private initBlockInsertionListeners(): void {
    document.querySelectorAll(".btn-insert-block").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const target = e.currentTarget as HTMLElement;
        const type = target.dataset.insert;
        if (type === "amazon") {
          this.insertSnippet(
            `\n<AmazonProduct\n  asin="B08N5WRWNW"\n  title="Product Name"\n  price="$29.99"\n  rating={4.5}\n  image="/uploads/product.webp"\n  ctaText="Buy on Amazon"\n/>\n`
          );
        } else if (type === "youtube") {
          this.insertSnippet(
            `\n<YouTube id="dQw4w9WgXcQ" title="Video Title" stretch="wide" />\n`
          );
        } else if (type === "list") {
          this.insertSnippet(
            `\n<List type="unordered">\n  <ListItem>\n    <Paragraph>First key takeaway</Paragraph>\n  </ListItem>\n  <ListItem>\n    <Paragraph>Second key takeaway</Paragraph>\n  </ListItem>\n</List>\n`
          );
        } else if (type === "related") {
          this.insertSnippet(
            `\n<RelatedPosts category="${this.postCategoryField?.value || 'General'}" limit={3} />\n`
          );
        } else if (type === "schema") {
          this.insertSnippet(
            `\n<Schema type="FAQPage" data={{\n  "@type": "FAQPage",\n  "mainEntity": [\n    {\n      "@type": "Question",\n      "name": "What is Astro?",\n      "acceptedAnswer": {\n        "@type": "Answer",\n        "text": "Astro is the web framework for content-driven websites."\n      }\n    }\n  ]\n}} />\n`
          );
        }
      });
    });

    document.querySelectorAll(".btn-callout").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const variant = (e.currentTarget as HTMLElement).dataset.callout || "note";
        this.insertSnippet(`\n<Callout variant="${variant}">\n  <Paragraph>Enter callout explanation here.</Paragraph>\n</Callout>\n`);
      });
    });
  }

  private initAssetModalListeners(): void {
    this.openAssetModalBtn?.addEventListener("click", () => this.openAssetPicker("editor"));
    this.browseHeroImageBtn?.addEventListener("click", () => this.openAssetPicker("featured"));

    this.closeAssetModalBtn?.addEventListener("click", () => this.assetModal.close());
    this.cancelAssetModalBtn?.addEventListener("click", () => this.assetModal.close());

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
        this.onAssetPickedForHero(this.pickedAsset.url);
      } else {
        if (this.pickedAsset.mimeType.startsWith("image/")) {
          this.insertSnippet(`\n<Image src="${this.pickedAsset.url}" alt="${this.pickedAsset.altText || this.pickedAsset.filename}" stretch="default" />\n`);
        } else {
          this.insertSnippet(`\n<Link href="${this.pickedAsset.url}">${this.pickedAsset.title || this.pickedAsset.filename}</Link>\n`);
        }
      }
      this.assetModal.close();
    });

    this.modalDropzone?.addEventListener("click", () => this.modalFileInput?.click());
    this.modalDropzone?.addEventListener("dragover", (e) => {
      e.preventDefault();
      this.modalDropzone?.classList.add("dragover");
    });
    this.modalDropzone?.addEventListener("dragleave", () => {
      this.modalDropzone?.classList.remove("dragover");
    });
    this.modalDropzone?.addEventListener("drop", async (e) => {
      e.preventDefault();
      this.modalDropzone?.classList.remove("dragover");
      if (e.dataTransfer?.files?.[0]) {
        await this.uploadFromModal(e.dataTransfer.files[0]);
      }
    });

    this.modalFileInput?.addEventListener("change", async () => {
      if (this.modalFileInput.files?.[0]) {
        await this.uploadFromModal(this.modalFileInput.files[0]);
        this.modalFileInput.value = "";
      }
    });
  }

  private openAssetPicker(target: "editor" | "featured"): void {
    this.pickerTarget = target;
    this.pickedAsset = null;
    if (this.confirmAssetModalBtn) {
      this.confirmAssetModalBtn.disabled = true;
      this.confirmAssetModalBtn.textContent = target === "featured" ? "Set as Featured Image" : "Insert into Article";
    }
    if (this.selectedAssetInfo) {
      this.selectedAssetInfo.innerHTML = `<span class="placeholder-text">Click an asset to select it</span>`;
    }
    this.switchModalTab("library");
    this.renderModalAssets();
    this.assetModal.showModal();
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
            <span>${a.filename.split('.').pop()?.toUpperCase() || "FILE"}</span>
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

  private async uploadFromModal(file: File): Promise<void> {
    const isImg = file.type.startsWith("image/");
    const maxSize = isImg ? 2 * 1024 * 1024 : 25 * 1024 * 1024;
    const maxLabel = isImg ? "2 MiB" : "25 MiB";

    if (file.size > maxSize) {
      alert(`File "${file.name}" exceeds the ${maxLabel} size limit.`);
      return;
    }

    if (this.modalUploadStatus) {
      this.modalUploadStatus.textContent = `Uploading ${file.name}...`;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/admin/assets/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as any;
      if (data.success) {
        const newAsset = {
          id: data.assetId,
          filename: data.filename,
          originalName: file.name,
          mimeType: data.mimeType || file.type,
          byteSize: data.byteSize || file.size,
          url: data.url,
          title: data.filename,
          altText: data.filename,
          description: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        this.allAssets.unshift(newAsset);

        if (this.pickerTarget === "featured") {
          this.onAssetPickedForHero(data.url);
        } else {
          this.insertSnippet(`\n${data.snippet || `![${data.filename}](${data.url})`}\n`);
        }

        if (this.modalUploadStatus) this.modalUploadStatus.textContent = "Upload successful & inserted!";
        setTimeout(() => {
          this.assetModal.close();
          if (this.modalUploadStatus) this.modalUploadStatus.textContent = "";
        }, 500);
      } else {
        alert(data.error || "Upload failed");
        if (this.modalUploadStatus) this.modalUploadStatus.textContent = "";
      }
    } catch {
      alert("Error contacting server");
      if (this.modalUploadStatus) this.modalUploadStatus.textContent = "";
    }
  }
}
