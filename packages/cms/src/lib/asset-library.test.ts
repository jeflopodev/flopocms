import { describe, expect, it } from "vitest";
import {
  assetLibrarySummary,
  assetLibraryView,
  mediaKindFor,
  previewUrlForAsset,
  type AssetSummary,
} from "./asset-library";

function asset(overrides: Partial<AssetSummary> = {}): AssetSummary {
  return {
    id: "asset-1",
    filename: "photo.png",
    url: "/uploads/photo.png",
    mimeType: "image/png",
    byteSize: 1024,
    createdAt: "2026-09-20T10:00:00.000Z",
    title: "",
    altText: "",
    description: "",
    ...overrides,
  };
}

const CATALOG: AssetSummary[] = [
  asset({ id: "a", filename: "zebra.png", byteSize: 300, createdAt: "2026-09-01T10:00:00.000Z" }),
  asset({
    id: "b",
    filename: "clip.mp4",
    mimeType: "video/mp4",
    byteSize: 900,
    createdAt: "2026-09-21T10:00:00.000Z",
  }),
  asset({
    id: "c",
    filename: "report.pdf",
    mimeType: "application/pdf",
    byteSize: 100,
    createdAt: "2026-09-19T10:00:00.000Z",
  }),
  asset({
    id: "d",
    filename: "apple.png",
    title: "Red apple",
    byteSize: 500,
    createdAt: "2026-09-18T10:00:00.000Z",
  }),
];

const ids = (assets: AssetSummary[], query?: Parameters<typeof assetLibraryView>[1]) =>
  assetLibraryView(assets, query).map((card) => card.id);

describe("the media kind", () => {
  it("tells images, videos and everything else apart", () => {
    expect(mediaKindFor("image/webp")).toBe("image");
    expect(mediaKindFor("video/mp4")).toBe("video");
    expect(mediaKindFor("application/pdf")).toBe("file");
    expect(mediaKindFor(null)).toBe("file");
  });
});

describe("filtering the Library", () => {
  it("shows newest first by default", () => {
    expect(ids(CATALOG)).toEqual(["b", "c", "d", "a"]);
  });

  it("filters by media type, with documents meaning neither image nor video", () => {
    expect(ids(CATALOG, { type: "image" })).toEqual(["d", "a"]);
    expect(ids(CATALOG, { type: "video" })).toEqual(["b"]);
    expect(ids(CATALOG, { type: "document" })).toEqual(["c"]);
  });

  it("searches the filename, the title and the alternative text", () => {
    expect(ids(CATALOG, { query: "clip" })).toEqual(["b"]);
    expect(ids(CATALOG, { query: "red" })).toEqual(["d"]);
    expect(ids(CATALOG, { query: "APPLE" })).toEqual(["d"]);
    expect(ids(CATALOG, { query: "  " })).toEqual(["b", "c", "d", "a"]);
  });

  it("combines the type filter with the search", () => {
    expect(ids(CATALOG, { type: "image", query: "zeb" })).toEqual(["a"]);
    expect(ids(CATALOG, { type: "video", query: "zeb" })).toEqual([]);
  });

  it("leaves the caller's list alone", () => {
    const original = [...CATALOG];
    assetLibraryView(CATALOG, { sort: "alpha" });

    expect(CATALOG).toEqual(original);
  });
});

describe("sorting the Library", () => {
  it("orders by age, size and name", () => {
    expect(ids(CATALOG, { sort: "oldest" })).toEqual(["a", "d", "c", "b"]);
    expect(ids(CATALOG, { sort: "largest" })).toEqual(["b", "d", "a", "c"]);
    expect(ids(CATALOG, { sort: "smallest" })).toEqual(["c", "a", "d", "b"]);
    expect(ids(CATALOG, { sort: "alpha" })).toEqual(["d", "b", "c", "a"]);
  });

  it("breaks a tie by filename rather than by whatever the database returned", () => {
    const sameMoment = [
      asset({ id: "later-id", filename: "beta.png", createdAt: "2026-09-21T10:00:00.000Z" }),
      asset({ id: "earlier-id", filename: "alpha.png", createdAt: "2026-09-21T10:00:00.000Z" }),
    ];

    expect(ids(sameMoment, { sort: "newest" })).toEqual(["earlier-id", "later-id"]);
    expect(ids(sameMoment, { sort: "largest" })).toEqual(["earlier-id", "later-id"]);
  });
});

describe("a card", () => {
  it("carries what the Library shows, and nothing to look up", () => {
    const card = assetLibraryView([CATALOG[3]])[0];

    expect(card).toMatchObject({
      id: "d",
      filename: "apple.png",
      url: "/uploads/photo.png",
      kind: "image",
      altText: "apple.png",
      sizeLabel: "0.5 KB",
      dateLabel: new Date("2026-09-18T10:00:00.000Z").toLocaleDateString(),
      dateTimeLabel: new Date("2026-09-18T10:00:00.000Z").toLocaleString(),
    });
  });

  it("prefers the Asset's own alternative text to its filename", () => {
    const card = assetLibraryView([asset({ altText: "A red apple" })])[0];

    expect(card.altText).toBe("A red apple");
  });
});

describe("the header", () => {
  it("counts the Assets and their weight", () => {
    expect(assetLibrarySummary(CATALOG)).toEqual({ total: 4, totalLabel: "1.8 KB" });
    // `formatBytes` says "0 KB" for nothing at all, which is the label the header shows.
    expect(assetLibrarySummary([])).toEqual({ total: 0, totalLabel: "0 KB" });
  });
});

describe("previewUrlForAsset", () => {
  it("addresses the session-guarded file route by record id", () => {
    expect(previewUrlForAsset("asset-1")).toBe("/api/admin/assets/file?id=asset-1");
  });

  it("encodes ids that are not URL-safe", () => {
    expect(previewUrlForAsset("a/b?c")).toBe("/api/admin/assets/file?id=a%2Fb%3Fc");
  });
});
