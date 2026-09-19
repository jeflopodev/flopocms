export const prerender = false;

import type { APIRoute } from "astro";
import { getDb } from "../../../../lib/db";
import { acquireLock, renewLock, releaseLock, getLockStatus } from "../../../../lib/locks";

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const url = new URL(request.url);
    const postId = url.searchParams.get("postId");

    if (!postId) {
      return new Response(JSON.stringify({ error: "Missing postId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb(locals);
    const status = await getLockStatus(db, postId, user.id);

    return new Response(JSON.stringify(status), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Get lock error:", err);
    return new Response(JSON.stringify({ error: err.message || "Failed to get lock status" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const url = new URL(request.url);
    let postId = url.searchParams.get("postId");
    let action = url.searchParams.get("action") || "acquire";

    if (!postId && request.headers.get("content-type")?.includes("application/json")) {
      try {
        const body = (await request.json()) as { postId?: string; action?: "acquire" | "renew" | "release" };
        if (body.postId) postId = body.postId;
        if (body.action) action = body.action;
      } catch {}
    }

    if (!postId) {
      return new Response(JSON.stringify({ error: "Missing postId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb(locals);

    if (action === "release") {
      await releaseLock(db, postId, user.id);
      return new Response(JSON.stringify({ success: true, released: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (action === "renew") {
      await renewLock(db, postId, user.id, 45);
      return new Response(JSON.stringify({ success: true, renewed: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Default: acquire
    const result = await acquireLock(db, postId, { id: user.id, username: user.username }, 45);

    return new Response(JSON.stringify(result), {
      status: result.locked ? 423 : 200, // 423 Locked if held by someone else
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Lock error:", err);
    return new Response(JSON.stringify({ error: err.message || "Failed to manage lock" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Support both JSON body and search params (for sendBeacon or fetch)
    let postId: string | null = null;
    const url = new URL(request.url);
    postId = url.searchParams.get("postId");

    if (!postId && request.headers.get("content-type")?.includes("application/json")) {
      try {
        const body = (await request.json()) as any;
        postId = body?.postId;
      } catch {}
    }

    if (!postId) {
      return new Response(JSON.stringify({ error: "Missing postId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb(locals);
    await releaseLock(db, postId, user.id);

    return new Response(JSON.stringify({ success: true, released: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Release lock error:", err);
    return new Response(JSON.stringify({ error: err.message || "Failed to release lock" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
