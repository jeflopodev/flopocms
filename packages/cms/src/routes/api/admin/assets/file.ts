export const prerender = false;

import { adminRoute, json } from "#/lib/admin-route";

/**
 * Serves one asset's bytes to the admin UI behind the editor's session.
 *
 * The stored asset `url` stays site-relative (`/uploads/<file>`): that is what
 * articles render, on the site's domain. But the admin itself may run on another
 * origin (decoupled CMS worker), where that relative URL 404s. Thumbnails,
 * previews and downloads in admin chrome read through here instead, resolved by
 * record id so callers never name a repository path.
 *
 * Asset bytes are written once and never rewritten, so the response is
 * long-lived immutable (private: admin-only, never on the public CDN path).
 */
export const GET = adminRoute(async ({ url, services }) => {
  const id = url.searchParams.get("id");
  if (!id) return json({ success: false, error: "Missing asset ID" }, 400);

  const asset = await services.assets.find(id);
  if (!asset) return json({ success: false, error: "Asset not found" }, 404);

  const bytes = await services.media.readMedia(asset.filename);
  if (!bytes) return json({ success: false, error: "Asset bytes not found" }, 404);

  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": asset.mimeType || "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
});
