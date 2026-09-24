export const prerender = false;

import { adminRoute, readJson } from "cms/lib/admin-route";
import { MIN_PASSWORD_LENGTH } from "cms/lib/editor-accounts";

interface ChangePasswordPayload {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

/** What each refusal from the module answers with. Credential policy stays in the module. */
const REFUSALS = {
  "wrong-password": { status: 400, error: "Incorrect current password." },
  "too-short": {
    status: 400,
    error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
  },
  "no-such-editor": { status: 404, error: "User account not found." },
} as const;

export const POST = adminRoute(async ({ request, user, services, cookies }) => {
  const raw = await readJson(request);
  if (!raw.ok) return { success: false, status: 400, error: raw.error };

  const { currentPassword, newPassword, confirmPassword } = raw.value as ChangePasswordPayload;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { success: false, status: 400, error: "All password fields are required." };
  }

  if (newPassword !== confirmPassword) {
    return { success: false, status: 400, error: "New password and confirmation do not match." };
  }

  const change = await services.accounts.changePassword({
    editorId: user.id,
    currentPassword,
    newPassword,
    // The Editor keeps working in this tab; every other session ends.
    keepToken: cookies.get("admin_session")?.value,
  });

  if (!change.ok) return { success: false, ...REFUSALS[change.reason] };

  return { success: true, message: "Password updated successfully!" };
});
