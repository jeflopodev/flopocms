import type { Mark } from "../types";

/**
 * Canonical DSL tag for each inline Mark.
 *
 * Private to the DSL module: the parser, the serializer, and the toolbar
 * model read this table, so the spelling of a mark exists exactly once.
 * Nothing outside `dsl/` imports it.
 */
export const MARK_TAGS: Record<Mark, string> = {
  bold: "Bold",
  italic: "Italic",
  strike: "Strike",
  code: "Code",
  underline: "Underline",
};

/**
 * Every tag spelling the parser accepts, including HTML-ish aliases.
 * Keys are lowercase: the parser lowercases tag names before lookup.
 */
export const MARK_TAG_ALIASES: Record<string, Mark> = {
  bold: "bold",
  strong: "bold",
  b: "bold",
  italic: "italic",
  em: "italic",
  i: "italic",
  strike: "strike",
  del: "strike",
  s: "strike",
  code: "code",
  underline: "underline",
  u: "underline",
};

/** The DSL spelling of an inline Mark around some text. */
export function markSnippet(mark: Mark, text = ""): string {
  const tag = MARK_TAGS[mark];
  return `<${tag}>${text}</${tag}>`;
}

/**
 * The DSL spelling of a Link, the only entity-referencing Mark Ref.
 *
 * `download` is optional: absent for an ordinary link, a filename for a file insertion,
 * or `true` for the bare attribute.
 */
export function linkSnippet(
  text = "link text",
  href = "https://",
  download?: string | boolean
): string {
  const downloadAttr =
    download === undefined || download === null || download === false || download === ""
      ? ""
      : download === true
        ? " download"
        : ` download="${String(download).replace(/"/g, '\\"')}"`;

  return `<Link href="${href}"${downloadAttr}>${text}</Link>`;
}
