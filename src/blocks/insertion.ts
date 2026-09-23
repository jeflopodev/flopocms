import { isImageMime } from "../lib/asset-rules";

/**
 * Asset Insertion: the one place that writes the text an uploaded asset inserts into an
 * Article.
 *
 * It returns JSX Block DSL, not Markdown, because the Document Renderer escapes text and
 * only parses registered blocks and inline Marks — `![alt](url)` reaches the reader as
 * those literal characters. An image therefore inserts as an `<Image>` block and any other
 * file as a `<Link>` inside a `<Paragraph>`.
 *
 * The module imports nothing but a mime predicate, so both the editor's client script and
 * the Asset Library's can call it; `registry.ts` re-exports it so the editor model stays
 * the one place an editor surface looks for an editing rule.
 */

export type AssetKind = "image" | "file";

/** Only `image/*` inserts as an image; everything else becomes a file link. */
export function assetKindFor(mimeType: string | null | undefined): AssetKind {
  return isImageMime(mimeType) ? "image" : "file";
}

export interface AssetInsertionInput {
  /** The URL the Asset Registry stored. */
  url: string;
  /** Decides whether this inserts as an image or a file link. */
  mimeType?: string | null;
  /** Preferred name: an image's alt text, a file's link text. */
  label?: string | null;
  /** The stored filename, used when no label is set and as the download name. */
  filename?: string | null;
}

/** The stored name of an asset, from its URL, when nothing better is known. */
function nameFromUrl(url: string): string {
  const path = url.split("?")[0].split("#")[0];
  const last = path.split("/").filter(Boolean).pop() || "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * Escapes a value for a double-quoted DSL attribute. Filenames are already sanitized to
 * `[a-z0-9._-]` on the way in, so this only ever matters for a hand-edited alt text.
 */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * The stored filenames a body plus featured image point at under `/uploads/`.
 *
 * The inverse of `insertionForAsset`: whatever that function can write, this reads
 * back, so Post Lifecycle can verify every referenced byte exists on `main` before
 * the publish commit lands. Sorted and distinct; anything not under `/uploads/`
 * (bundled images, remote URLs) is not an upload and is ignored.
 */
export function referencedUploads(input: { contentMdx?: string | null; featuredImage?: string | null }): string[] {
  const found = new Set<string>();

  const take = (url: string | null | undefined) => {
    if (!url) return;
    const clean = url.split("?")[0].split("#")[0];
    const marker = "/uploads/";
    const at = clean.indexOf(marker);
    if (at === -1) return;
    let name = clean.slice(at + marker.length).split("/").filter(Boolean).pop() || "";
    try {
      name = decodeURIComponent(name);
    } catch {
      // Keep the raw spelling: verification compares names, it never fetches this.
    }
    if (name) found.add(name);
  };

  // `<Image src="...">` and `<Link href="...">` carry the references; one pattern
  // covers both spellings plus any hand-typed variant of them.
  const body = input.contentMdx || "";
  const pattern = /\/uploads\/[^\s"'<>()]+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) take(match[0]);

  take(input.featuredImage);

  return [...found].sort();
}

export function insertionForAsset(input: AssetInsertionInput): string {
  const name = (input.label || input.filename || nameFromUrl(input.url) || "asset").trim() || "asset";
  const url = escapeAttribute(input.url);

  if (assetKindFor(input.mimeType) === "image") {
    return `<Image src="${url}" alt="${escapeAttribute(name)}" />`;
  }

  const download = escapeAttribute((input.filename || nameFromUrl(input.url) || name).trim());
  return `<Paragraph><Link href="${url}" download="${download}">${escapeAttribute(name)}</Link></Paragraph>`;
}
