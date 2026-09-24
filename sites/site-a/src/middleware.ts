import { defineMiddleware } from "astro:middleware";
import { createServices } from "cms/lib/services";

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Only protect /admin and /api/admin paths
  const isAdminPage = pathname.startsWith("/admin");
  const isAdminApi = pathname.startsWith("/api/admin");

  if (!isAdminPage && !isAdminApi) {
    return next();
  }

  // Allow login page and public assets without authentication
  if (pathname === "/admin/login") {
    const token = context.cookies.get("admin_session")?.value;
    if (token) {
      try {
        const { accounts } = createServices(context.locals);
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
});
