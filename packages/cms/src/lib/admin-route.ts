import type { APIRoute, AstroCookies } from "astro";
import type { Services } from "./services";
import { createServices } from "./services";

/**
 * The envelope every `/api/admin/*` route shares.
 *
 * Before this, each of the eight routes resolved its own dependencies, guessed whether a
 * user was present, wrote its own try/catch, and built every response by hand — 28
 * `new Response(JSON.stringify(…))` sites in total, 14 of them in the lock route alone.
 * Here it is once: a handler receives the Actor, the Services and the request, and returns
 * a value.
 *
 * Authentication itself stays in the middleware, which answers 401 for every
 * `/api/admin/*` path before a handler runs; the check below is the single place the
 * optional `locals.user` is narrowed for the handler's benefit.
 */
export interface AdminRouteRequest {
  /** The Editor the middleware authenticated. */
  user: { id: string; username: string };
  /** The adapters this request needs, resolved once. */
  services: Services;
  request: Request;
  url: URL;
  params: Record<string, string | undefined>;
  /** The request's cookies, so a route that changes credentials can name its own session. */
  cookies: AstroCookies;
  locals: App.Locals;
}

/** A handler's answer: any object becomes JSON, and a Response is passed through. */
export type AdminRouteResult = unknown | Response;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * A returned object carrying a numeric `status` sets the response status.
 *
 * Post Lifecycle's results already carry one, which is how a refused save reaches the
 * Editor as 400, 409, 422 or 423 without the route restating the mapping.
 */
function statusOf(result: unknown): number {
  const status = (result as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : 200;
}

export function adminRoute(handler: (context: AdminRouteRequest) => Promise<AdminRouteResult>): APIRoute {
  return async ({ request, locals, params, cookies }) => {
    const user = locals.user;
    if (!user) return json({ success: false, error: "Unauthorized" }, 401);

    try {
      const result = await handler({
        user,
        services: createServices(locals),
        request,
        url: new URL(request.url),
        params: params as Record<string, string | undefined>,
        cookies,
        locals,
      });

      if (result instanceof Response) return result;
      return json(result, statusOf(result));
    } catch (err: any) {
      const { pathname } = new URL(request.url);
      console.error(`Admin route ${request.method} ${pathname} failed:`, err);
      return json({ success: false, error: err?.message || "Request failed" }, 500);
    }
  };
}

/**
 * Decodes a JSON body, without throwing when there is not one.
 *
 * The routes that accept a body accept one from `fetch` and, at least for locking, from
 * other transports too, so "unreadable" is a 400 the caller decides on rather than an
 * exception the wrapper swallows.
 */
export async function readJson(
  request: Request
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, error: "Expected a JSON body" };
  }
}
