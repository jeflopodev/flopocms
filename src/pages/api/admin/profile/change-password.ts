export const prerender = false;

import type { APIRoute } from "astro";
import { getDb, type UserRow } from "../../../../lib/db";
import { generateSalt, hashPassword, verifyPassword } from "../../../../lib/auth";

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await request.json();
    const { currentPassword, newPassword, confirmPassword } = body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return new Response(
        JSON.stringify({ success: false, error: "All password fields are required." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (newPassword !== confirmPassword) {
      return new Response(
        JSON.stringify({ success: false, error: "New password and confirmation do not match." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (newPassword.length < 8) {
      return new Response(
        JSON.stringify({ success: false, error: "New password must be at least 8 characters long." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const db = getDb(locals);
    const userRecord = await db
      .prepare("SELECT * FROM users WHERE id = ?")
      .bind(user.id)
      .first<UserRow>();

    if (!userRecord) {
      return new Response(
        JSON.stringify({ success: false, error: "User account not found." }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const isCurrentValid = await verifyPassword(
      currentPassword,
      userRecord.salt,
      userRecord.password_hash
    );

    if (!isCurrentValid) {
      return new Response(
        JSON.stringify({ success: false, error: "Incorrect current password." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Generate new salt and hash
    const newSalt = generateSalt();
    const newHash = await hashPassword(newPassword, newSalt);

    await db
      .prepare("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?")
      .bind(newHash, newSalt, user.id)
      .run();

    return new Response(
      JSON.stringify({ success: true, message: "Password updated successfully!" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Change password error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Failed to update password." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
