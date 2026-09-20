import { slugify } from "../../utils/slugify";

export interface SaveWorkflowOptions {
  postId: string;
  initialSlug: string;
  initialStatus?: "draft" | "published";
  getContentMdx: () => string;
  isReadOnly: () => boolean;
  onLockConflict: (errorMsg: string) => void;
}

export class SaveWorkflow {
  private postId: string;
  private currentStatus: "draft" | "published";
  private getContentMdx: () => string;
  private isReadOnly: () => boolean;
  private onLockConflict: (errorMsg: string) => void;

  private isSaving = false;
  private isDirty = false;
  private isSlugManuallyEdited = false;

  // DOM Elements
  private topbarTitleInput = document.getElementById("topbar-title-input") as HTMLInputElement | null;
  private postTitleField = document.getElementById("post-title-field") as HTMLInputElement | null;
  private postSlugField = document.getElementById("post-slug-field") as HTMLInputElement | null;
  private resyncSlugBtn = document.getElementById("resync-slug-btn");
  private postTemplateSelect = document.getElementById("post-template-select") as HTMLSelectElement | null;
  private postDefaultWidthField = document.getElementById("post-default-width-field") as HTMLInputElement | null;
  private postWideWidthField = document.getElementById("post-wide-width-field") as HTMLInputElement | null;
  private postDescField = document.getElementById("post-desc-field") as HTMLTextAreaElement | null;
  private postCategoryField = document.getElementById("post-category-field") as HTMLSelectElement | null;
  private postAuthorField = document.getElementById("post-author-field") as HTMLSelectElement | null;
  private postPubdateField = document.getElementById("post-pubdate-field") as HTMLInputElement | null;
  private postTagsField = document.getElementById("post-tags-field") as HTMLInputElement | null;
  private postImageField = document.getElementById("post-image-field") as HTMLInputElement | null;

  // Action Buttons & Badges
  private primaryActionBtn = document.getElementById("primary-action-btn") as HTMLButtonElement | null;
  private primaryBtnText = document.getElementById("primary-btn-text");
  private secondaryActionBtn = document.getElementById("secondary-action-btn") as HTMLButtonElement | null;
  private secondaryBtnText = document.getElementById("secondary-btn-text");

  private previewLink = document.getElementById("preview-link") as HTMLAnchorElement | null;
  private previewLinkText = document.getElementById("preview-link-text");
  private statusBadge = document.getElementById("post-status-badge");
  private drawerStatusBadge = document.getElementById("drawer-status-badge");
  private saveIndicator = document.getElementById("save-indicator");
  private saveIndicatorText = this.saveIndicator?.querySelector(".indicator-text");

  private handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (this.isDirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  };

  constructor(options: SaveWorkflowOptions) {
    this.postId = options.postId;
    this.currentStatus = options.initialStatus || "draft";
    this.getContentMdx = options.getContentMdx;
    this.isReadOnly = options.isReadOnly;
    this.onLockConflict = options.onLockConflict;

    this.updateUIState();
    this.initEventListeners();
  }

  public markDirty(): void {
    if (this.isReadOnly()) return;
    this.isDirty = true;
    window.addEventListener("beforeunload", this.handleBeforeUnload);

    if (this.saveIndicator) {
      this.saveIndicator.className = "save-indicator unsaved";
      if (this.saveIndicatorText) this.saveIndicatorText.textContent = "Cambios sin guardar";
    }
  }

  public async saveCurrentState(): Promise<void> {
    // CTRL+S saves as draft or published according to current state
    await this.savePost(this.currentStatus);
  }

  public async savePost(targetStatus: "draft" | "published"): Promise<void> {
    if (this.isSaving || this.isReadOnly()) return;
    this.isSaving = true;
    this.setButtonsDisabled(true);

    const isPublishAction = targetStatus === "published";

    if (this.saveIndicator) {
      this.saveIndicator.className = "save-indicator saving";
      if (this.saveIndicatorText) {
        this.saveIndicatorText.textContent = isPublishAction
          ? "Publicando en GitHub & D1..."
          : "Guardando en D1...";
      }
    }

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
      status: targetStatus,
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
        window.removeEventListener("beforeunload", this.handleBeforeUnload);
        this.currentStatus = data.statusState || targetStatus;

        if (this.saveIndicator) {
          this.saveIndicator.className = "save-indicator saved";
          if (this.saveIndicatorText) {
            this.saveIndicatorText.textContent = data.message || (
              this.currentStatus === "published" ? "Publicado en GitHub & D1" : "Borrador guardado en D1"
            );
          }
        }

        this.updateUIState(data.slug || payload.slug);
      } else {
        if (this.saveIndicator) {
          this.saveIndicator.className = "save-indicator error";
          if (this.saveIndicatorText) this.saveIndicatorText.textContent = data.error || "Error al guardar";
        }
        if (res.status === 423) {
          this.onLockConflict(data.error);
        }
      }
    } catch {
      if (this.saveIndicator) {
        this.saveIndicator.className = "save-indicator error";
        if (this.saveIndicatorText) this.saveIndicatorText.textContent = "Error de red";
      }
    } finally {
      this.isSaving = false;
      this.setButtonsDisabled(false);
    }
  }

  private setButtonsDisabled(disabled: boolean): void {
    if (this.primaryActionBtn) this.primaryActionBtn.disabled = disabled || this.isReadOnly();
    if (this.secondaryActionBtn) this.secondaryActionBtn.disabled = disabled || this.isReadOnly();
  }

  private updateUIState(slug?: string): void {
    const isPublished = this.currentStatus === "published";
    const currentSlug = slug || this.postSlugField?.value.trim() || "";

    // 1. Status Badges
    const statusText = isPublished ? "Published" : "Draft";
    const statusClass = `status-tag ${isPublished ? "published" : "draft"}`;

    if (this.statusBadge) {
      this.statusBadge.className = statusClass;
      this.statusBadge.textContent = statusText;
    }
    if (this.drawerStatusBadge) {
      this.drawerStatusBadge.className = statusClass;
      this.drawerStatusBadge.textContent = statusText;
    }

    // 2. Action Buttons
    if (isPublished) {
      // Post is published
      if (this.primaryBtnText) this.primaryBtnText.textContent = "Guardar Cambios";
      if (this.primaryActionBtn) {
        this.primaryActionBtn.title = "Guardar cambios y sincronizar en GitHub main";
        this.primaryActionBtn.className = "btn btn-primary action-primary-btn";
      }

      if (this.secondaryBtnText) this.secondaryBtnText.textContent = "Pasar a Borrador";
      if (this.secondaryActionBtn) {
        this.secondaryActionBtn.title = "Despublicar y retirar de producción";
        this.secondaryActionBtn.className = "btn btn-secondary action-secondary-btn btn-unpublish";
      }
    } else {
      // Post is draft
      if (this.primaryBtnText) this.primaryBtnText.textContent = "Publicar";
      if (this.primaryActionBtn) {
        this.primaryActionBtn.title = "Publicar en GitHub main y desplegar a producción";
        this.primaryActionBtn.className = "btn btn-primary action-primary-btn";
      }

      if (this.secondaryBtnText) this.secondaryBtnText.textContent = "Guardar Borrador";
      if (this.secondaryActionBtn) {
        this.secondaryActionBtn.title = "Guardar borrador en D1 (sin tocar Git)";
        this.secondaryActionBtn.className = "btn btn-secondary action-secondary-btn";
      }
    }

    // 3. Preview Link
    if (this.previewLink) {
      if (isPublished) {
        this.previewLink.href = `/blog/${currentSlug}`;
        this.previewLink.title = "Ver artículo publicado en vivo";
        if (this.previewLinkText) this.previewLinkText.textContent = "Ver en Vivo";
      } else {
        this.previewLink.href = `/admin/posts/${this.postId}/preview`;
        this.previewLink.title = "Previsualizar borrador con estilos reales";
        if (this.previewLinkText) this.previewLinkText.textContent = "Previsualizar";
      }
    }
  }

  private handleTitleInput(val: string): void {
    if (this.topbarTitleInput && this.topbarTitleInput.value !== val) this.topbarTitleInput.value = val;
    if (this.postTitleField && this.postTitleField.value !== val) this.postTitleField.value = val;

    if (!this.isSlugManuallyEdited && val.trim()) {
      const autoSlug = slugify(val);
      if (this.postSlugField) {
        this.postSlugField.value = autoSlug;
        this.updateUIState(autoSlug);
      }
    }
    this.markDirty();
  }

  private initEventListeners(): void {
    // Title fields
    this.topbarTitleInput?.addEventListener("input", (e) => {
      this.handleTitleInput((e.target as HTMLInputElement).value);
    });

    this.postTitleField?.addEventListener("input", (e) => {
      this.handleTitleInput((e.target as HTMLInputElement).value);
    });

    // Slug field
    this.postSlugField?.addEventListener("input", () => {
      this.isSlugManuallyEdited = true;
      this.updateUIState(this.postSlugField?.value.trim());
      this.markDirty();
    });

    this.resyncSlugBtn?.addEventListener("click", () => {
      const title = this.topbarTitleInput?.value.trim() || this.postTitleField?.value.trim() || "";
      if (title && this.postSlugField) {
        const autoSlug = slugify(title);
        this.postSlugField.value = autoSlug;
        this.isSlugManuallyEdited = false;
        this.updateUIState(autoSlug);
        this.markDirty();
      }
    });

    // Metadata form inputs
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

    // Primary Action Button: "Publicar" (draft) or "Guardar Cambios" (published)
    this.primaryActionBtn?.addEventListener("click", () => {
      if (this.currentStatus === "draft") {
        const confirmed = window.confirm("¿Publicar este artículo en GitHub main y desplegar a producción?");
        if (confirmed) {
          this.savePost("published");
        }
      } else {
        this.savePost("published");
      }
    });

    // Secondary Action Button: "Guardar Borrador" (draft) or "Pasar a Borrador" (published)
    this.secondaryActionBtn?.addEventListener("click", () => {
      if (this.currentStatus === "published") {
        const confirmed = window.confirm("¿Seguro que deseas pasar este artículo a borrador? Se retirará de producción.");
        if (confirmed) {
          this.savePost("draft");
        }
      } else {
        this.savePost("draft");
      }
    });

    // Keyboard shortcut: CTRL+S / CMD+S
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        this.saveCurrentState();
      }
    });
  }
}
