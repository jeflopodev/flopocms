import { EditorView, basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { LockManager } from "./lock-manager";
import { SaveWorkflow } from "./save-workflow";
import { ModalController } from "./modal-controller";

export interface EditorInitData {
  post: {
    id: string;
    slug: string;
    content_mdx?: string;
    isInitiallyLocked?: boolean;
    lockUser?: string;
  };
  assets: any[];
}

export function initEditor(data: EditorInitData): void {
  const { post, assets } = data;
  const container = document.getElementById("codemirror-container");
  if (!container) return;

  const postImageField = document.getElementById("post-image-field") as HTMLInputElement;

  // CodeMirror Theme
  const themeConfig = EditorView.theme({
    "&": {
      height: "100%",
      fontSize: "15px",
      color: "var(--text-primary)",
      backgroundColor: "var(--bg-surface)",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "var(--font-mono)",
      lineHeight: "1.65",
    },
    ".cm-content": {
      padding: "24px 32px",
      maxWidth: "960px",
      margin: "0 auto",
    },
    ".cm-line": {
      padding: "0",
    },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: "var(--primary)",
      borderLeftWidth: "2px",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "rgba(79, 70, 229, 0.18)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--bg-surface-elevated)",
      color: "var(--text-muted)",
      borderRight: "1px solid var(--border-subtle)",
      paddingRight: "8px",
    },
  });

  let saveWorkflowRef: SaveWorkflow | null = null;
  let lockManagerRef: LockManager | null = null;

  // Initialize CodeMirror EditorView
  const editorView = new EditorView({
    doc: post.content_mdx || "",
    extensions: [
      basicSetup,
      markdown(),
      EditorView.lineWrapping,
      EditorView.editable.of(!Boolean(post.isInitiallyLocked)),
      themeConfig,
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !lockManagerRef?.getReadOnly()) {
          saveWorkflowRef?.markDirty();
        }
      }),
    ],
    parent: container,
  });

  // Lock Manager
  lockManagerRef = new LockManager({
    postId: post.id,
    isInitiallyLocked: Boolean(post.isInitiallyLocked),
    lockUser: post.lockUser,
    onReadOnlyChanged: (isReadOnly) => {
      editorView.dispatch({
        effects: [],
      });
    },
  });

  // Save Workflow
  saveWorkflowRef = new SaveWorkflow({
    postId: post.id,
    initialSlug: post.slug,
    getContentMdx: () => editorView.state.doc.toString(),
    isReadOnly: () => lockManagerRef?.getReadOnly() ?? false,
    onLockConflict: (errorMsg) => {
      lockManagerRef?.setReadOnly(errorMsg);
    },
  });

  // Formatting helper
  function applyFormatting(tool: string) {
    const selection = editorView.state.selection.main;
    const hasSelection = !selection.empty;
    const selectedText = editorView.state.sliceDoc(selection.from, selection.to);

    let insertText = "";
    let newAnchor = selection.from;
    let newHead = selection.from;

    switch (tool) {
      case "bold":
        if (hasSelection) {
          insertText = `**${selectedText}**\n`;
          newAnchor = selection.from + insertText.length;
          newHead = newAnchor;
        } else {
          insertText = `****`;
          newAnchor = selection.from + 2;
          newHead = newAnchor;
        }
        break;

      case "italic":
        if (hasSelection) {
          insertText = `*${selectedText}*\n`;
          newAnchor = selection.from + insertText.length;
          newHead = newAnchor;
        } else {
          insertText = `**`;
          newAnchor = selection.from + 1;
          newHead = newAnchor;
        }
        break;

      case "strike":
        if (hasSelection) {
          insertText = `~~${selectedText}~~\n`;
          newAnchor = selection.from + insertText.length;
          newHead = newAnchor;
        } else {
          insertText = `~~~~`;
          newAnchor = selection.from + 2;
          newHead = newAnchor;
        }
        break;

      case "link":
        if (hasSelection) {
          insertText = `[${selectedText}]()\n`;
          newAnchor = selection.from + insertText.length;
          newHead = newAnchor;
        } else {
          insertText = `[]()`;
          newAnchor = selection.from + 1;
          newHead = newAnchor;
        }
        break;

      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const level = parseInt(tool.replace("h", ""), 10);
        const prefix = "#".repeat(level) + " ";
        if (hasSelection) {
          insertText = `${prefix}${selectedText}\n`;
          newAnchor = selection.from + insertText.length;
          newHead = newAnchor;
        } else {
          insertText = prefix;
          newAnchor = selection.from + prefix.length;
          newHead = newAnchor;
        }
        break;
      }

      case "quote":
        if (hasSelection) {
          insertText = `> ${selectedText}\n`;
          newAnchor = selection.from + insertText.length;
          newHead = newAnchor;
        } else {
          insertText = `> `;
          newAnchor = selection.from + 2;
          newHead = newAnchor;
        }
        break;

      case "code":
        if (hasSelection) {
          insertText = `\`\`\`\n${selectedText}\n\`\`\`\n`;
          newAnchor = selection.from + insertText.length;
          newHead = newAnchor;
        } else {
          insertText = `\`\`\`\n\n\`\`\``;
          newAnchor = selection.from + 4;
          newHead = newAnchor;
        }
        break;

      case "bullet":
        if (hasSelection) {
          insertText = `- ${selectedText}\n`;
          newAnchor = selection.from + insertText.length;
        } else {
          insertText = `- `;
          newAnchor = selection.from + 2;
        }
        newHead = newAnchor;
        break;

      case "numbered":
        if (hasSelection) {
          insertText = `1. ${selectedText}\n`;
          newAnchor = selection.from + insertText.length;
        } else {
          insertText = `1. `;
          newAnchor = selection.from + 3;
        }
        newHead = newAnchor;
        break;
    }

    editorView.dispatch({
      changes: { from: selection.from, to: selection.to, insert: insertText },
      selection: { anchor: newAnchor, head: newHead },
    });
    editorView.focus();
    saveWorkflowRef?.markDirty();
  }

  // Snippet inserter
  function insertSnippet(snippet: string) {
    const { from, to } = editorView.state.selection.main;
    editorView.dispatch({
      changes: { from, to, insert: snippet },
      selection: { anchor: from + snippet.length },
    });
    editorView.focus();
    saveWorkflowRef?.markDirty();
  }

  // Modal Controller
  new ModalController({
    initialAssets: assets,
    insertSnippet,
    applyFormatting,
    onAssetPickedForHero: (url) => {
      if (postImageField) {
        postImageField.value = url;
        saveWorkflowRef?.markDirty();
      }
    },
  });
}
