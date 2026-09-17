export const prerender = false;

import type { APIRoute } from "astro";
import { getDb } from "../../../lib/db";
import { deleteSession } from "../../../lib/session";

export const POST: APIRoute = async ({ cookies, locals, redirect }) => {
  const token = cookies.get("admin_session")?.value;
  if (token) {
    try {
      const db = getDb(locals);
      await deleteSession(db, token);
    } catch (err) {
      console.error("Logout deleteSession error:", err);
    }
  }

  cookies.delete("admin_session", { path: "/" });
  return redirect("/admin/login");
};

export const GET: APIRoute = async (context) => {
  return POST(context);
};
