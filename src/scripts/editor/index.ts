import { EditorView, basicSetup } from "codemirror";
import { Compartment } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { EditorSession } from "./editor-session";
import { EditorDomAdapter } from "./dom-adapter";
import { LockManager } from "./lock-manager";
import { ModalController } from "./modal-controller";
import { actionChange, actionFor } from "./actions";

/**
 * What the Editor needs handed to it to start, and nothing more.
 *
 * The metadata fields are server-rendered into the Settings Panel, so they are read from
 * the DOM rather than shipped a second time in this payload — the copy that used to sit
 * here was never read, and keeping it in step was a standing invitation to drift.
 */
export interface EditorInitData {
  post: {
    id: string;
    slug: string;
    status?: "draft" | "published";
    content_mdx?: string;
    isInitiallyLocked?: boolean;
    lockUser?: string;
  };
  assets: any[];
}

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

export function initEditor(data: EditorInitData): void {
  const { post, assets } = data;
  const container = document.getElementById("codemirror-container");
  if (!container) return;

  // The session holds the state. Adapters below supply what it cannot know: the body,
  // the metadata fields, the network call, and the lock conversation.
  const session = new EditorSession({
    postId: post.id,
    initialSlug: post.slug,
    initialStatus: post.status || "draft",
    initialReadOnly: Boolean(post.isInitiallyLocked),
    initialLockedBy: post.lockUser,
    readContent: () => editorView.state.doc.toString(),
    readMetadata: () => dom.readMetadata(),
    persist: async (payload) => {
      const res = await fetch("/api/admin/posts/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as any;

      return {
        ok: Boolean(body.success),
        status: res.status,
        lockedBy: body.lockedBy,
        slug: body.slug,
        statusState: body.statusState,
        message: body.message,
        error: body.error,
      };
    },
  });

  const editableCompartment = new Compartment();

  const editorView = new EditorView({
    doc: post.content_mdx || "",
    extensions: [
      basicSetup,
      markdown(),
      EditorView.lineWrapping,
      editableCompartment.of(EditorView.editable.of(!session.isReadOnly)),
      themeConfig,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) session.markDirty();
      }),
    ],
    parent: container,
  });

  // CodeMirror adapter: read-only reaches the document itself, so a lock conflict
  // actually stops typing.
  session.subscribe((snapshot) => {
    editorView.dispatch({
      effects: editableCompartment.reconfigure(EditorView.editable.of(!snapshot.readOnly)),
    });
  });

  // DOM adapter: reads the metadata fields, renders the chrome, owns beforeunload
  const dom = new EditorDomAdapter(session, post.id);

  // Lock client adapter: heartbeat, instant release, and conflict reports
  new LockManager({
    postId: post.id,
    initiallyLocked: Boolean(post.isInitiallyLocked),
    lockUser: post.lockUser,
    onConflict: (lockedBy) => session.lockConflict(lockedBy),
    isReadOnly: () => session.isReadOnly,
  });

  /**
   * Applies a toolbar action: the insertion and the caret both come from the action list,
   * so this function has no spelling or offset of its own to get wrong.
   */
  function applyFormatting(tool: string): void {
    const action = actionFor(tool);
    if (!action) return;

    const selection = editorView.state.selection.main;
    const selectedText = editorView.state.sliceDoc(selection.from, selection.to);
    const change = actionChange(action, selectedText);

    editorView.dispatch({
      changes: { from: selection.from, to: selection.to, insert: change.insert },
      selection: {
        anchor: selection.from + change.caret.start,
        head: selection.from + change.caret.end,
      },
    });
    editorView.focus();
    session.markDirty();
  }

  // Snippet inserter
  function insertSnippet(snippet: string): void {
    const { from, to } = editorView.state.selection.main;
    editorView.dispatch({
      changes: { from, to, insert: snippet },
      selection: { anchor: from + snippet.length },
    });
    editorView.focus();
    session.markDirty();
  }

  // Modal Controller
  new ModalController({
    initialAssets: assets,
    insertSnippet,
    applyFormatting,
    onAssetPickedForHero: (url) => dom.setFeaturedImage(url),
  });
}
