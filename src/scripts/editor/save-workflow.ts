import { slugify } from "../../utils/slugify";

export interface SaveWorkflowOptions {
  postId: string;
  initialSlug: string;
  getContentMdx: () => string;
  isReadOnly: () => boolean;
  onLockConflict: (errorMsg: string) => void;
}

export class SaveWorkflow {
  private postId: string;
  private getContentMdx: () => string;
  private isReadOnly: () => boolean;
  private onLockConflict: (errorMsg: string) => void;

  private isSaving = false;
  private isDirty = false;
  private autoSaveTimer: any = null;
  private isSlugManuallyEdited = false;

  // DOM Elements
  private topbarTitleInput = document.getElementById("topbar-title-input") as HTMLInputElement;
  private topbarStatusSelect = document.getElementById("topbar-status-select") as unknown as HTMLSelectElement;
  private postTitleField = document.getElementById("post-title-field") as HTMLInputElement;
  private postSlugField = document.getElementById("post-slug-field") as HTMLInputElement;
  private resyncSlugBtn = document.getElementById("resync-slug-btn");
  private postTemplateSelect = document.getElementById("post-template-select") as unknown as HTMLSelectElement;
  private postDefaultWidthField = document.getElementById("post-default-width-field") as HTMLInputElement;
  private postWideWidthField = document.getElementById("post-wide-width-field") as HTMLInputElement;
  private postDescField = document.getElementById("post-desc-field") as HTMLTextAreaElement;
  private postCategoryField = document.getElementById("post-category-field") as unknown as HTMLSelectElement;
  private postAuthorField = document.getElementById("post-author-field") as unknown as HTMLSelectElement;
  private postPubdateField = document.getElementById("post-pubdate-field") as HTMLInputElement;
  private postStatusSelect = document.getElementById("post-status-select") as unknown as HTMLSelectElement;
  private postTagsField = document.getElementById("post-tags-field") as HTMLInputElement;
  private postImageField = document.getElementById("post-image-field") as HTMLInputElement;
  private manualSaveBtn = document.getElementById("manual-save-btn") as HTMLButtonElement;
  private previewLink = document.getElementById("preview-link") as HTMLAnchorElement;
  private statusBadge = document.getElementById("post-status-badge");
  private saveIndicator = document.getElementById("save-indicator");
  private saveIndicatorText = this.saveIndicator?.querySelector(".indicator-text");

  constructor(options: SaveWorkflowOptions) {
    this.postId = options.postId;
    this.getContentMdx = options.getContentMdx;
    this.isReadOnly = options.isReadOnly;
    this.onLockConflict = options.onLockConflict;

    this.initEventListeners();
  }

  public markDirty(): void {
    if (this.isReadOnly()) return;
    this.isDirty = true;
    if (this.saveIndicator) {
      this.saveIndicator.className = "save-indicator unsaved";
      if (this.saveIndicatorText) this.saveIndicatorText.textContent = "Unsaved changes";
    }
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.savePost();
    }, 1500);
  }

  public async savePost(): Promise<void> {
    if (this.isSaving || this.isReadOnly()) return;
    this.isSaving = true;

    if (this.saveIndicator) {
      this.saveIndicator.className = "save-indicator saving";
      if (this.saveIndicatorText) this.saveIndicatorText.textContent = "Saving to D1 & Git...";
    }

    const currentStatus = this.topbarStatusSelect?.value || this.postStatusSelect?.value || "draft";
    const tagsRaw = this.postTagsField?.value || "";
    const tagsArray = tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const payload = {
      id: this.postId,
      slug: this.postSlugField?.value.trim(),
      title: this.topbarTitleInput?.value.trim() || "Untitled Article",
      description: this.postDescField?.value.trim(),
      category: this.postCategoryField?.value,
      tags: tagsArray,
      author: this.postAuthorField?.value,
      featured_image: this.postImageField?.value.trim(),
      content_mdx: this.getContentMdx(),
      status: currentStatus,
      template: this.postTemplateSelect?.value || "default",
      default_width: this.postDefaultWidthField?.value.trim() || "60rem",
      wide_width: this.postWideWidthField?.value.trim() || "70rem",
      pub_date: this.postPubdateField?.value ? `${this.postPubdateField.value}T12:00:00.000Z` : undefined,
    };

    try {
      const res = await fetch("/api/admin/posts/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as any;
      if (data.success) {
        this.isDirty = false;
        if (this.saveIndicator) {
          this.saveIndicator.className = "save-indicator saved";
          if (this.saveIndicatorText) {
            this.saveIndicatorText.textContent = data.merged ? "Published & Merged" : "Saved to D1 & Git";
          }
        }
        if (this.statusBadge) {
          this.statusBadge.className = `status-tag ${payload.status}`;
          this.statusBadge.textContent = payload.status === "published" ? "Published" : "Draft";
        }
        this.updatePreviewLink(payload.status, data.slug || payload.slug);
      } else {
        if (this.saveIndicator) {
          this.saveIndicator.className = "save-indicator error";
          if (this.saveIndicatorText) this.saveIndicatorText.textContent = data.error || "Save error";
        }
        if (res.status === 423) {
          this.onLockConflict(data.error);
        }
      }
    } catch {
      if (this.saveIndicator) {
        this.saveIndicator.className = "save-indicator error";
        if (this.saveIndicatorText) this.saveIndicatorText.textContent = "Network error";
      }
    } finally {
      this.isSaving = false;
    }
  }

  private handleTitleInput(val: string): void {
    if (this.topbarTitleInput && this.topbarTitleInput.value !== val) this.topbarTitleInput.value = val;
    if (this.postTitleField && this.postTitleField.value !== val) this.postTitleField.value = val;

    if (!this.isSlugManuallyEdited && val.trim()) {
      const autoSlug = slugify(val);
      if (this.postSlugField) {
        this.postSlugField.value = autoSlug;
        if (this.previewLink) this.previewLink.href = `/blog/${autoSlug}`;
      }
    }
    this.markDirty();
  }

  private syncStatus(newStatus: string): void {
    if (this.topbarStatusSelect) this.topbarStatusSelect.value = newStatus;
    if (this.postStatusSelect) this.postStatusSelect.value = newStatus;
    if (this.statusBadge) {
      this.statusBadge.className = `status-tag ${newStatus}`;
      this.statusBadge.textContent = newStatus === "published" ? "Published" : "Draft";
    }
    this.updatePreviewLink(newStatus);
    this.markDirty();
  }

  private updatePreviewLink(status?: string, slug?: string): void {
    if (!this.previewLink) return;
    const currentStatus = status || this.topbarStatusSelect?.value || this.postStatusSelect?.value || "draft";
    const currentSlug = slug || this.postSlugField?.value.trim() || "";
    const previewText = document.getElementById("preview-link-text");

    if (currentStatus === "published") {
      this.previewLink.href = `/blog/${currentSlug}`;
      this.previewLink.title = "View published article live";
      if (previewText) previewText.textContent = "View Live";
    } else {
      this.previewLink.href = `/admin/posts/${this.postId}/preview`;
      this.previewLink.title = "Preview draft with live styles";
      if (previewText) previewText.textContent = "Preview Draft";
    }
  }

  private initEventListeners(): void {
    this.topbarTitleInput?.addEventListener("input", (e) => {
      this.handleTitleInput((e.target as HTMLInputElement).value);
    });

    this.postTitleField?.addEventListener("input", (e) => {
      this.handleTitleInput((e.target as HTMLInputElement).value);
    });

    this.postSlugField?.addEventListener("input", () => {
      this.isSlugManuallyEdited = true;
      if (this.previewLink && this.postSlugField) {
        this.previewLink.href = `/blog/${this.postSlugField.value.trim()}`;
      }
      this.markDirty();
    });

    this.resyncSlugBtn?.addEventListener("click", () => {
      const title = this.topbarTitleInput?.value.trim() || this.postTitleField?.value.trim() || "";
      if (title && this.postSlugField) {
        const autoSlug = slugify(title);
        this.postSlugField.value = autoSlug;
        this.isSlugManuallyEdited = false;
        if (this.previewLink) this.previewLink.href = `/blog/${autoSlug}`;
        this.markDirty();
      }
    });

    const formInputs = [
      this.postTemplateSelect,
      this.postDefaultWidthField,
      this.postWideWidthField,
      this.postDescField,
      this.postCategoryField,
      this.postAuthorField,
      this.postPubdateField,
      this.postTagsField,
      this.postImageField,
    ];

    formInputs.forEach((el) => {
      el?.addEventListener("input", () => this.markDirty());
      el?.addEventListener("change", () => this.markDirty());
    });

    this.topbarStatusSelect?.addEventListener("change", () => this.syncStatus(this.topbarStatusSelect.value));
    this.postStatusSelect?.addEventListener("change", () => this.syncStatus(this.postStatusSelect.value));

    this.manualSaveBtn?.addEventListener("click", () => {
      clearTimeout(this.autoSaveTimer);
      this.savePost();
    });
  }
}
