export const prerender = false;

import { adminRoute, readJson } from "cms/lib/admin-route";
import { articleWriteModel } from "cms/lib/article-write-model";
import { savePostLifecycle } from "cms/lib/post-lifecycle";

export const POST = adminRoute(async ({ request, user, services }) => {
  const raw = await readJson(request);
  if (!raw.ok) return { success: false, status: 400, error: raw.error };

  // Untrusted JSON in, write model out. A field with the wrong type is named here
  // rather than arriving as `undefined` for the store's default to absorb.
  const parsed = articleWriteModel(raw.value);
  if (!parsed.ok) return { success: false, status: 400, error: parsed.error };

  // One key per explicit save intent: a retried PUT replays the stored result
  // instead of committing twice. Fail open when the store itself is down.
  const key = request.headers.get("Idempotency-Key")?.trim();
  if (key) {
    try {
      const hit = await services.idempotency.find(key);
      if (hit) return hit.body;
    } catch (err) {
      console.warn("Idempotency lookup failed, proceeding without replay:", err);
    }
  }

  const result = await savePostLifecycle({ payload: parsed.model, actor: user, services });

  if (key) {
    try {
      await services.idempotency.save(key, result.status ?? 200, result);
    } catch (err) {
      console.warn("Idempotency store failed, save already applied:", err);
    }
  }

  return result;
});
