import { defineMiddleware } from "astro:middleware";
import { createServices } from "./lib/services";

/**
 * The edge auth guard for every editorial surface (`/admin`, `/api/admin`).
 *
 * Sites keep a three-line `src/middleware.ts` delegating here: Astro resolves
 * middleware from the site project, never from an integration, so this module
 * holds the logic and the site holds the hook. The only writer of
 * `Astro.locals.user`.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  try {
    const { pathname } = context.url;

    // Only protect /admin and /api/admin paths
    const isAdminPage = pathname.startsWith("/admin");
    const isAdminApi = pathname.startsWith("/api/admin");

    if (!isAdminPage && !isAdminApi) {
      return next();
    }

    const { accounts } = createServices(context.locals);
  let userCount = 0;
  try {
    userCount = await accounts.count();
  } catch (err) {
    console.error("Middleware checking accounts count error:", err);
  }

  // First-run setup: if no user accounts exist yet in D1, redirect to /admin/setup
  if (userCount === 0) {
    if (pathname === "/admin/setup") {
      return next();
    }
    if (isAdminApi) {
      return new Response(JSON.stringify({ error: "CMS not initialized. Please complete initial setup." }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    return context.redirect("/admin/setup");
  }

  // Once an account exists, /admin/setup is no longer accessible
  if (pathname === "/admin/setup") {
    return context.redirect("/admin/login");
  }

  // Allow login page without authentication
  if (pathname === "/admin/login") {
    const token = context.cookies.get("admin_session")?.value;
    if (token) {
      try {
        const user = await accounts.editorFor(token);
        if (user) {
          return context.redirect("/admin/posts");
        }
      } catch {
        // Fall through to render login
      }
    }
    return next();
  }

  const token = context.cookies.get("admin_session")?.value;
  if (!token) {
    if (isAdminApi) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return context.redirect("/admin/login");
  }

  try {
    const { accounts } = createServices(context.locals);
    const user = await accounts.editorFor(token);
    if (!user) {
      context.cookies.delete("admin_session", { path: "/" });
      if (isAdminApi) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return context.redirect("/admin/login");
    }

    context.locals.user = user;
    return next();
  } catch (error) {
    console.error("Middleware auth verification error:", error);
    if (isAdminApi) {
      return new Response(JSON.stringify({ error: "Internal Server Error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    return context.redirect("/admin/login");
  }
} catch (fatalError: any) {
  console.error("FATAL MIDDLEWARE ERROR:", fatalError);
  return new Response(`[FATAL MIDDLEWARE ERROR] ${fatalError?.message}\n${fatalError?.stack}`, {
    status: 500,
    headers: { "Content-Type": "text/plain" },
  });
}
});
