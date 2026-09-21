import { formatBytes } from "./asset-rules";

/**
 * Asset Library view model.
 *
 * What the Asset Library shows, decided without a document. The page keeps its markup —
 * which element and which class a card uses is a presentation decision — but it no longer
 * decides anything: the filter, the sort, the size and date labels and the empty state all
 * come from here, where they can be exercised without a browser.
 *
 * The Asset Insertion text is deliberately absent: it belongs to the Block Registry's rule
 * (see `insertion.ts`), which the page already calls for its copy button.
 */

/** The Asset fields this module reads. Structurally what `listAssets` returns. */
export interface AssetSummary {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
  title?: string | null;
  altText?: string | null;
  description?: string | null;
}

/** How the Library presents an Asset. Three cases, unlike the insertion rule's two. */
export type MediaKind = "image" | "video" | "file";

export type AssetTypeFilter = "all" | "image" | "video" | "document";

export type AssetSort = "newest" | "oldest" | "largest" | "smallest" | "alpha";

export interface AssetLibraryQuery {
  query?: string;
  type?: AssetTypeFilter;
  sort?: AssetSort;
}

export interface AssetCard {
  id: string;
  filename: string;
  url: string;
  kind: MediaKind;
  mimeType: string;
  /** Alternative text if the Asset has any, otherwise its filename. */
  altText: string;
  sizeLabel: string;
  dateLabel: string;
  /** The same day, with the time: the Asset detail view says exactly when. */
  dateTimeLabel: string;
}

export const EMPTY_FILTER_MESSAGE = "No assets match the selected filter criteria.";

export function mediaKindFor(mimeType: string | null | undefined): MediaKind {
  const mime = mimeType || "";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

function matchesType(kind: MediaKind, type: AssetTypeFilter): boolean {
  if (type === "all") return true;
  if (type === "document") return kind === "file";
  return kind === type;
}

function matchesQuery(asset: AssetSummary, query: string): boolean {
  if (!query) return true;

  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  return [asset.filename, asset.title, asset.altText].some((field) =>
    (field || "").toLowerCase().includes(needle)
  );
}

/**
 * Orders two Assets. Every case falls through to the filename, so two uploads in the same
 * second still come out in a stable order rather than whatever the database returned.
 */
function compare(a: AssetSummary, b: AssetSummary, sort: AssetSort): number {
  const byName = () => a.filename.localeCompare(b.filename);

  switch (sort) {
    case "oldest":
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || byName();
    case "largest":
      return b.byteSize - a.byteSize || byName();
    case "smallest":
      return a.byteSize - b.byteSize || byName();
    case "alpha":
      return byName();
    case "newest":
    default:
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || byName();
  }
}

function toCard(asset: AssetSummary): AssetCard {
  return {
    id: asset.id,
    filename: asset.filename,
    url: asset.url,
    kind: mediaKindFor(asset.mimeType),
    mimeType: asset.mimeType,
    altText: asset.altText || asset.filename,
    sizeLabel: formatBytes(asset.byteSize),
    dateLabel: new Date(asset.createdAt).toLocaleDateString(),
    dateTimeLabel: new Date(asset.createdAt).toLocaleString(),
  };
}

/** One Asset's display properties, for a view that shows a single Asset at a time. */
export function assetCard(asset: AssetSummary): AssetCard {
  return toCard(asset);
}

/** The Assets the Library shows, in the order it shows them. */
export function assetLibraryView(assets: readonly AssetSummary[], query: AssetLibraryQuery = {}): AssetCard[] {
  const { query: search = "", type = "all", sort = "newest" } = query;

  return assets
    .filter((asset) => matchesType(mediaKindFor(asset.mimeType), type) && matchesQuery(asset, search))
    .slice()
    .sort((a, b) => compare(a, b, sort))
    .map(toCard);
}

/** The header's two figures, so "Total Weight" is summed in one place. */
export function assetLibrarySummary(assets: readonly AssetSummary[]): { total: number; totalLabel: string } {
  return {
    total: assets.length,
    totalLabel: formatBytes(assets.reduce((sum, asset) => sum + (asset.byteSize || 0), 0)),
  };
}
