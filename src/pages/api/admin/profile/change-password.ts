export const prerender = false;

import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, users } from "../../../../lib/db";
import { generateSalt, hashPassword, verifyPassword } from "../../../../lib/auth";

interface ChangePasswordPayload {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = (await request.json()) as ChangePasswordPayload;
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
    const [userRecord] = await db
      .select()
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!userRecord) {
      return new Response(
        JSON.stringify({ success: false, error: "User account not found." }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const isCurrentValid = await verifyPassword(
      currentPassword,
      userRecord.salt,
      userRecord.passwordHash
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
      .update(users)
      .set({ passwordHash: newHash, salt: newSalt })
      .where(eq(users.id, user.id));

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
