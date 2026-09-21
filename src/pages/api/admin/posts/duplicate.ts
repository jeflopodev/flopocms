export const prerender = false;

import { adminRoute, readJson } from "../../../../lib/admin-route";
import type { PostRecord } from "../../../../lib/post-store";

export const POST = adminRoute(async ({ request, services }) => {
  const raw = await readJson(request);
  if (!raw.ok) return { success: false, status: 400, error: raw.error };

  const { id } = raw.value as { id?: string };
  if (!id) return { success: false, status: 400, error: "Missing post ID" };

  const original = await services.posts.find(id);
  if (!original) return { success: false, status: 404, error: "Post not found" };

  const newId = crypto.randomUUID();
  const suffix = Math.random().toString(36).substring(2, 6);
  // The composition root's Clock, rather than a fourth reading of the system time.
  const now = services.clock.now().toISOString();

  const copy: PostRecord = {
    ...original,
    id: newId,
    slug: `${original.slug}-copy-${suffix}`,
    title: `${original.title} (Copy)`,
    // A copy is never born published.
    status: "draft",
    pubDate: now,
    createdAt: now,
    updatedAt: now,
  };

  await services.posts.save(copy);

  return { success: true, newId };
});
