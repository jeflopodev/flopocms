/**
 * Where the author's text belongs in an insertion snippet. Block toolbar entries
 * author their snippets with this marker, and the editor resolves it to a caret.
 * It lives here — not in the toolbar module — so block definitions can use it
 * without creating an import cycle through the registry. It never reaches a document.
 *
 * Mark spelling (tags, aliases, snippet builders) is private to the DSL module
 * (`./dsl/marks`); this module keeps only the editor-side placeholder both
 * blocks and the toolbar read.
 */
export const CARET = "|";
