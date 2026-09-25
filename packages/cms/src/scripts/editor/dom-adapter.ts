import { slugify } from "../../utils/slugify";
import type { EditableArticleFields } from "../../lib/article-write-model";
import type { EditorSession, SessionSnapshot } from "./editor-session";

export interface EditorDomAdapterOptions {
  applyFormatting?: (tool: string) => void;
  insertSnippet?: (snippet: string) => void;
}

/**
 * DOM adapter.
 *
 * Reads the metadata fields, renders the session's snapshot into the editor chrome, and
 * translates clicks and keystrokes into session events. It holds no state of its own
 * beyond the slug-edited flag, which is purely a property of these inputs.
 */
export class EditorDomAdapter {
  private isSlugManuallyEdited = false;

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

  private lockBanner = document.getElementById("lock-warning-banner");
  private lockBannerText = document.getElementById("lock-warning-text");

  // Drawer Elements
  private activePanel: "settings" | "blocks" | "none" = "settings";
  private drawer = document.getElementById("editor-drawer");
  private drawerHeading = document.getElementById("drawer-heading");
  private drawerCloseBtn = document.getElementById("drawer-close-btn");
  private toggleSettingsBtn = document.getElementById("toggle-settings-btn");
  private toggleBlocksBtn = document.getElementById("toggle-blocks-btn");
  private settingsPanel = document.getElementById("settings-panel-content");
  private blocksPanel = document.getElementById("blocks-panel-content");

  private handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (this.session.hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = "";
    }
  };

  private readonly session: EditorSession;
  private readonly postId: string;
  private readonly options?: EditorDomAdapterOptions;

  constructor(session: EditorSession, postId: string, options?: EditorDomAdapterOptions) {
    this.session = session;
    this.postId = postId;
    this.options = options;
    this.initEventListeners();
    this.session.subscribe((snapshot) => this.render(snapshot));
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

  /** Everything the session needs to persist the Article, read from the fields. */
  public readMetadata(): EditableArticleFields {
    const tagsRaw = this.postTagsField?.value || "";
    const templateValue = this.postTemplateSelect?.value;

    return {
      slug: this.postSlugField?.value.trim() || "",
      title: this.topbarTitleInput?.value.trim() || "Untitled Article",
      description: this.postDescField?.value.trim() || "",
      category: this.postCategoryField?.value || "General",
      tags: tagsRaw
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      author: this.postAuthorField?.value || undefined,
      featured_image: this.postImageField?.value.trim() || "",
      template: templateValue === "two-column" ? "two-column" : "default",
      default_width: this.postDefaultWidthField?.value.trim() || "60rem",
      wide_width: this.postWideWidthField?.value.trim() || "70rem",
      pub_date: this.postPubdateField?.value ? `${this.postPubdateField.value}T12:00:00.000Z` : undefined,
    };
  }

  public setFeaturedImage(url: string): void {
    if (this.postImageField) {
      this.postImageField.value = url;
      this.session.markDirty();
    }
  }

  private render(snapshot: SessionSnapshot): void {
    this.renderStatus(snapshot);
    this.renderActions(snapshot);
    this.renderSaveIndicator(snapshot);
    this.renderLockBanner(snapshot);
  }

  private renderStatus(snapshot: SessionSnapshot): void {
    const isPublished = snapshot.status === "published";
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

    const previewTarget = isPublished ? `/blog/${snapshot.slug}` : `/admin/posts/${this.postId}/preview`;
    if (this.previewLink) {
      this.previewLink.href = previewTarget;
      this.previewLink.title = isPublished ? "Ver artículo publicado en vivo" : "Previsualizar borrador con estilos reales";
    }
    if (this.previewLinkText) {
      this.previewLinkText.textContent = isPublished ? "Ver en Vivo" : "Previsualizar";
    }
  }

  private renderActions(snapshot: SessionSnapshot): void {
    const isPublished = snapshot.status === "published";
    const busy = snapshot.phase === "saving";
    // Clean means saved: with nothing to write the buttons stand down instead of
    // inviting another click that can only produce an identical commit.
    const hasChanges = snapshot.phase === "dirty" || snapshot.phase === "error";
    const disabled = snapshot.readOnly || busy || !hasChanges;

    if (isPublished) {
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

    if (this.primaryActionBtn) this.primaryActionBtn.disabled = disabled;
    if (this.secondaryActionBtn) this.secondaryActionBtn.disabled = disabled;
  }

  private renderSaveIndicator(snapshot: SessionSnapshot): void {
    if (!this.saveIndicator) return;

    const className =
      snapshot.phase === "dirty"
        ? "save-indicator unsaved"
        : snapshot.phase === "saving"
          ? "save-indicator saving"
          : snapshot.phase === "error"
            ? "save-indicator error"
            : "save-indicator saved";

    this.saveIndicator.className = className;
    if (this.saveIndicatorText) this.saveIndicatorText.textContent = snapshot.message;
  }

  private renderLockBanner(snapshot: SessionSnapshot): void {
    if (!this.lockBanner) return;

    if (snapshot.readOnly) {
      this.lockBanner.classList.remove("hidden");
      if (this.lockBannerText) {
        this.lockBannerText.textContent = `Article is currently being edited by @${
          snapshot.lockedBy || "another editor"
        }. You are in Read-Only mode.`;
      }
    } else {
      this.lockBanner.classList.add("hidden");
    }
  }

  private handleTitleInput(val: string): void {
    if (this.topbarTitleInput && this.topbarTitleInput.value !== val) this.topbarTitleInput.value = val;
    if (this.postTitleField && this.postTitleField.value !== val) this.postTitleField.value = val;

    if (!this.isSlugManuallyEdited && val.trim() && this.postSlugField) {
      this.postSlugField.value = slugify(val);
    }
    this.session.markDirty();
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
      this.session.markDirty();
    });

    this.resyncSlugBtn?.addEventListener("click", () => {
      const title = this.topbarTitleInput?.value.trim() || this.postTitleField?.value.trim() || "";
      if (title && this.postSlugField) {
        this.postSlugField.value = slugify(title);
        this.isSlugManuallyEdited = false;
        this.session.markDirty();
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
      el?.addEventListener("input", () => this.session.markDirty());
      el?.addEventListener("change", () => this.session.markDirty());
    });

    // The primary button always publishes; the secondary always saves as a draft.
    this.primaryActionBtn?.addEventListener("click", () => {
      if (this.session.currentStatus === "draft") {
        const confirmed = window.confirm("¿Publicar este artículo en GitHub main y desplegar a producción?");
        if (!confirmed) return;
      }
      void this.session.saveRequested("published");
    });

    this.secondaryActionBtn?.addEventListener("click", () => {
      if (this.session.currentStatus === "published") {
        const confirmed = window.confirm("¿Seguro que deseas pasar este artículo a borrador? Se retirará de producción.");
        if (!confirmed) return;
      }
      void this.session.saveRequested("draft");
    });

    // CTRL+S / CMD+S saves against the Article's current status
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void this.session.saveRequested();
      }
    });

    // Drawer panel toggles
    this.toggleSettingsBtn?.addEventListener("click", () => {
      this.setPanel(this.activePanel === "settings" ? "none" : "settings");
    });
    this.toggleBlocksBtn?.addEventListener("click", () => {
      this.setPanel(this.activePanel === "blocks" ? "none" : "blocks");
    });
    this.drawerCloseBtn?.addEventListener("click", () => {
      this.setPanel("none");
    });

    // Formatting toolbar clicks
    if (this.options?.applyFormatting) {
      document.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const tool = (btn as HTMLElement).dataset.tool;
          if (tool) this.options?.applyFormatting?.(tool);
        });
      });
    }

    // Block insertion snippet clicks: the whole card is the button.
    if (this.options?.insertSnippet) {
      document.querySelectorAll(".block-card[data-snippet]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const snippet = (btn as HTMLElement).dataset.snippet;
          if (snippet) this.options?.insertSnippet?.(snippet);
        });
      });
    }

    // Unsaved work is protected here, because this adapter is the one that knows the page
    window.addEventListener("beforeunload", this.handleBeforeUnload);
  }
}
