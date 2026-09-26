export const prerender = false;

import type { APIRoute } from "astro";
import { createServices } from "../../../lib/services";

export const POST: APIRoute = async ({ cookies, locals, redirect }) => {
  const token = cookies.get("admin_session")?.value;
  if (token) {
    try {
      const { accounts } = createServices(locals);
      await accounts.signOut(token);
    } catch (err) {
      console.error("Logout sign-out error:", err);
    }
  }

  cookies.delete("admin_session", { path: "/" });
  return redirect("/admin/login");
};
