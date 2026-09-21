export const prerender = false;

import { eq } from "drizzle-orm";
import { adminRoute, readJson } from "../../../../lib/admin-route";
import { users } from "../../../../lib/db";
import { generateSalt, hashPassword, verifyPassword } from "../../../../lib/auth";

interface ChangePasswordPayload {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export const POST = adminRoute(async ({ request, user, services }) => {
  const raw = await readJson(request);
  if (!raw.ok) return { success: false, status: 400, error: raw.error };

  const { currentPassword, newPassword, confirmPassword } = raw.value as ChangePasswordPayload;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { success: false, status: 400, error: "All password fields are required." };
  }

  if (newPassword !== confirmPassword) {
    return { success: false, status: 400, error: "New password and confirmation do not match." };
  }

  if (newPassword.length < 8) {
    return { success: false, status: 400, error: "New password must be at least 8 characters long." };
  }

  const { db } = services;
  const [userRecord] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

  if (!userRecord) {
    return { success: false, status: 404, error: "User account not found." };
  }

  const isCurrentValid = await verifyPassword(currentPassword, userRecord.salt, userRecord.passwordHash);
  if (!isCurrentValid) {
    return { success: false, status: 400, error: "Incorrect current password." };
  }

  const newSalt = generateSalt();
  const newHash = await hashPassword(newPassword, newSalt);

  await db.update(users).set({ passwordHash: newHash, salt: newSalt }).where(eq(users.id, user.id));

  return { success: true, message: "Password updated successfully!" };
});
