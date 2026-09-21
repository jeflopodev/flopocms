export const prerender = false;

import { adminRoute, readJson } from "../../../../lib/admin-route";
import { articleWriteModel } from "../../../../lib/article-write-model";
import { savePostLifecycle } from "../../../../lib/post-lifecycle";

export const POST = adminRoute(async ({ request, user, services }) => {
  const raw = await readJson(request);
  if (!raw.ok) return { success: false, status: 400, error: raw.error };

  // Untrusted JSON in, write model out. A field with the wrong type is named here
  // rather than arriving as `undefined` for the store's default to absorb.
  const parsed = articleWriteModel(raw.value);
  if (!parsed.ok) return { success: false, status: 400, error: parsed.error };

  return savePostLifecycle({ payload: parsed.model, actor: user, services });
});
