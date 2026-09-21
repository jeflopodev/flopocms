export const prerender = false;

import type { APIRoute } from "astro";
import { createServices } from "../../../lib/services";
import { deleteSession } from "../../../lib/session";

export const POST: APIRoute = async ({ cookies, locals, redirect }) => {
  const token = cookies.get("admin_session")?.value;
  if (token) {
    try {
      const { db } = createServices(locals);
      await deleteSession(db, token);
    } catch (err) {
      console.error("Logout deleteSession error:", err);
    }
  }

  cookies.delete("admin_session", { path: "/" });
  return redirect("/admin/login");
};
