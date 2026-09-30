import { describe, expect, it } from "vitest";
import {
  InMemoryEditorAccounts,
  MIN_PASSWORD_LENGTH,
  editorAccountFrom,
  normalizeUsername,
  type EditorAccount,
} from "./editor-accounts";
import type { Clock } from "./clock";

const START = new Date("2026-09-21T12:00:00.000Z");
const DAY = 24 * 60 * 60;

/** A clock the test moves, which is the only reason the session lifetime is observable. */
function testClock(): Clock & { advance(seconds: number): void } {
  let now = START;

  return {
    now: () => now,
    advance: (seconds) => {
      now = new Date(now.getTime() + seconds * 1000);
    },
  };
}

const PASSWORD = "correct-horse-battery";

async function account(username = "jeflopo", password = PASSWORD): Promise<EditorAccount> {
  return editorAccountFrom(username, password, START);
}

async function signedIn(username = "jeflopo") {
  const clock = testClock();
  const accounts = new InMemoryEditorAccounts(clock, [await account(username)]);
  const session = await accounts.signIn(username, PASSWORD);

  if (!session) throw new Error("the test failed to sign in");

  return { clock, accounts, session };
}

describe("signing in", () => {
  it("issues a session for the stored credentials", async () => {
    const { accounts, session } = await signedIn();

    expect(session.token).toBeTruthy();
    expect(await accounts.editorFor(session.token)).toEqual({ id: session.editor.id, username: "jeflopo" });
  });

  it("refuses the wrong password without saying whether the Editor exists", async () => {
    const { accounts } = await signedIn();

    expect(await accounts.signIn("jeflopo", "not-the-password")).toBeNull();
    expect(await accounts.signIn("nobody", PASSWORD)).toBeNull();
  });

  it("matches the username the way it was stored", async () => {
    const { accounts } = await signedIn();

    expect(normalizeUsername(" Jeflopo ")).toBe("jeflopo");
    expect(await accounts.signIn(" Jeflopo ", PASSWORD)).not.toBeNull();
  });

  it("is nobody for a token it never issued, and for no token at all", async () => {
    const { accounts } = await signedIn();

    expect(await accounts.editorFor("invented-token")).toBeNull();
    expect(await accounts.editorFor(undefined)).toBeNull();
  });
});

describe("a session", () => {
  it("lasts until its 30th day and is deleted once it passes", async () => {
    const { clock, accounts, session } = await signedIn();

    clock.advance(30 * DAY - 1);
    expect(await accounts.editorFor(session.token)).not.toBeNull();

    clock.advance(2);
    expect(await accounts.editorFor(session.token)).toBeNull();
    expect(accounts.storedSessions()).toHaveLength(0);
  });

  it("stops resolving once the Editor signs out", async () => {
    const { accounts, session } = await signedIn();

    await accounts.signOut(session.token);

    expect(await accounts.editorFor(session.token)).toBeNull();
  });

  it("signing out a token nobody holds changes nothing", async () => {
    const { accounts, session } = await signedIn();

    await accounts.signOut("invented-token");

    expect(await accounts.editorFor(session.token)).not.toBeNull();
  });
});

describe("changing a password", () => {
  it("re-derives the hash with a new salt, so the old password stops working", async () => {
    const { accounts, session } = await signedIn();

    const change = await accounts.changePassword({
      editorId: session.editor.id,
      currentPassword: PASSWORD,
      newPassword: "a-brand-new-secret",
      keepToken: session.token,
    });

    expect(change).toEqual({ ok: true });
    expect(await accounts.signIn("jeflopo", PASSWORD)).toBeNull();
    expect(await accounts.signIn("jeflopo", "a-brand-new-secret")).not.toBeNull();
  });

  it("ends every other session and keeps the one that made the change", async () => {
    const { accounts, session } = await signedIn();
    const elsewhere = await accounts.signIn("jeflopo", PASSWORD);
    if (!elsewhere) throw new Error("the test failed to sign in twice");

    await accounts.changePassword({
      editorId: session.editor.id,
      currentPassword: PASSWORD,
      newPassword: "a-brand-new-secret",
      keepToken: session.token,
    });

    expect(await accounts.editorFor(session.token)).not.toBeNull();
    expect(await accounts.editorFor(elsewhere.token)).toBeNull();
  });

  it("ends every session when the change is not made from one", async () => {
    const { accounts, session } = await signedIn();

    await accounts.changePassword({
      editorId: session.editor.id,
      currentPassword: PASSWORD,
      newPassword: "a-brand-new-secret",
    });

    expect(await accounts.editorFor(session.token)).toBeNull();
  });

  it("refuses the wrong current password and a password that is too short", async () => {
    const { accounts, session } = await signedIn();
    const tooShort = "x".repeat(MIN_PASSWORD_LENGTH - 1);

    expect(
      await accounts.changePassword({
        editorId: session.editor.id,
        currentPassword: "not-the-password",
        newPassword: "a-brand-new-secret",
      })
    ).toEqual({ ok: false, reason: "wrong-password" });

    expect(
      await accounts.changePassword({
        editorId: session.editor.id,
        currentPassword: PASSWORD,
        newPassword: tooShort,
      })
    ).toEqual({ ok: false, reason: "too-short" });

    expect(await accounts.signIn("jeflopo", PASSWORD)).not.toBeNull();
  });

  it("has nothing to change for an Editor who does not exist", async () => {
    const { accounts } = await signedIn();

    expect(
      await accounts.changePassword({
        editorId: "invented-id",
        currentPassword: PASSWORD,
        newPassword: "a-brand-new-secret",
      })
    ).toEqual({ ok: false, reason: "no-such-editor" });
  });
});

describe("a profile", () => {
  it("carries the account and the sessions that have not expired", async () => {
    const { clock, accounts, session } = await signedIn();
    const elsewhere = await accounts.signIn("jeflopo", PASSWORD);
    if (!elsewhere) throw new Error("the test failed to sign in twice");

    const mine = await accounts.profile(session.editor.id, { currentToken: session.token });

    expect(mine).toMatchObject({ editor: { username: "jeflopo" }, createdAt: START.toISOString() });
    expect(mine?.sessions).toHaveLength(2);
    expect(mine?.sessions.filter((open) => open.current)).toHaveLength(1);

    // The badge follows the token that asked, not a position in the list.
    const theirs = await accounts.profile(session.editor.id, { currentToken: elsewhere.token });
    expect(theirs?.sessions.find((open) => open.current)?.id).not.toBe(
      mine?.sessions.find((open) => open.current)?.id
    );

    clock.advance(31 * DAY);

    expect((await accounts.profile(session.editor.id))?.sessions).toHaveLength(0);
  });

  it("lists no token, because the token is the credential", async () => {
    const { accounts, session } = await signedIn();

    const listed = (await accounts.profile(session.editor.id))?.sessions ?? [];

    expect(Object.keys(listed[0]).sort()).toEqual(["createdAt", "current", "expiresAt", "id"]);
  });

  it("is absent for an Editor who does not exist", async () => {
    const { accounts } = await signedIn();

    expect(await accounts.profile("invented-id")).toBeNull();
  });
});

describe("ending a session", () => {
  async function twoSessions() {
    const { clock, accounts, session } = await signedIn();
    const elsewhere = await accounts.signIn("jeflopo", PASSWORD);
    if (!elsewhere) throw new Error("the test failed to sign in twice");

    const listed = (await accounts.profile(session.editor.id, { currentToken: session.token }))
      ?.sessions ?? [];
    const mine = listed.find((open) => open.current)?.id;
    const other = listed.find((open) => !open.current)?.id;
    if (!mine || !other) throw new Error("the test did not get two sessions");

    return { clock, accounts, session, elsewhere, mine, other };
  }

  it("ends the session named without touching the one that asked", async () => {
    const { accounts, session, elsewhere, mine, other } = await twoSessions();

    const ended = await accounts.endSession({
      editorId: session.editor.id,
      sessionId: other,
      currentToken: session.token,
    });

    expect(ended).toEqual({ ended: true, endedCurrent: false });
    expect(await accounts.editorFor(elsewhere.token)).toBeNull();
    expect(await accounts.editorFor(session.token)).not.toBeNull();
    expect(mine).not.toBe(other);
  });

  it("signs the Editor out when the session they end is their own", async () => {
    const { accounts, session, mine } = await twoSessions();

    const ended = await accounts.endSession({
      editorId: session.editor.id,
      sessionId: mine,
      currentToken: session.token,
    });

    expect(ended).toEqual({ ended: true, endedCurrent: true });
    expect(await accounts.editorFor(session.token)).toBeNull();
  });

  it("will not end a session belonging to another Editor", async () => {
    const clock = testClock();
    const accounts = new InMemoryEditorAccounts(clock, [
      await account("jeflopo"),
      await account("aflopo"),
    ]);

    const aflopo = await accounts.signIn("aflopo", PASSWORD);
    const mine = await accounts.signIn("jeflopo", PASSWORD);
    if (!aflopo || !mine) throw new Error("the test failed to sign both Editors in");

    const theirs = (await accounts.profile(aflopo.editor.id))?.sessions[0].id;
    if (!theirs) throw new Error("the other Editor has no session to end");

    expect(
      await accounts.endSession({ editorId: mine.editor.id, sessionId: theirs })
    ).toEqual({ ended: false, endedCurrent: false });
    expect(await accounts.editorFor(aflopo.token)).not.toBeNull();
  });

  it("reports nothing ended for a session that is already gone", async () => {
    const { accounts, session } = await twoSessions();

    expect(
      await accounts.endSession({ editorId: session.editor.id, sessionId: "invented-id" })
    ).toEqual({ ended: false, endedCurrent: false });
  });

  it("ends every session the Editor has, and answers how many", async () => {
    const clock = testClock();
    const accounts = new InMemoryEditorAccounts(clock, [
      await account("jeflopo"),
      await account("aflopo"),
    ]);

    const aflopo = await accounts.signIn("aflopo", PASSWORD);
    const mine = await accounts.signIn("jeflopo", PASSWORD);
    const elsewhere = await accounts.signIn("jeflopo", PASSWORD);
    if (!aflopo || !mine || !elsewhere) throw new Error("the test failed to sign in");

    expect(await accounts.endAllSessions(mine.editor.id)).toBe(2);
    expect(await accounts.editorFor(mine.token)).toBeNull();
    expect(await accounts.editorFor(elsewhere.token)).toBeNull();

    // The other Editor's session is not this Editor's to end.
    expect(await accounts.editorFor(aflopo.token)).not.toBeNull();
  });
});

describe("an Editor Account", () => {
  it("is one spelling of salt width, hash and identity", async () => {
    const created = await account("Jeflopo");

    expect(created.username).toBe("jeflopo");
    expect(created.salt).toHaveLength(32);
    expect(created.passwordHash).toHaveLength(64);
    expect(created.createdAt).toBe(START.toISOString());
  });
});

describe("initial setup and user count", () => {
  it("reports 0 accounts when empty and provisions the first admin", async () => {
    const clock = testClock();
    const accounts = new InMemoryEditorAccounts(clock, []);

    expect(await accounts.count()).toBe(0);

    const initial = await accounts.createInitialUser("admin", "secure-password-123");
    expect(initial).not.toBeNull();
    expect(initial?.editor.username).toBe("admin");
    expect(initial?.token).toBeTruthy();

    expect(await accounts.count()).toBe(1);

    // Verifies session is issued and active
    const current = await accounts.editorFor(initial?.token);
    expect(current?.username).toBe("admin");

    // Second call fails because an admin already exists
    const duplicate = await accounts.createInitialUser("hacker", "another-password-123");
    expect(duplicate).toBeNull();
    expect(await accounts.count()).toBe(1);
  });

  it("rejects password shorter than MIN_PASSWORD_LENGTH", async () => {
    const clock = testClock();
    const accounts = new InMemoryEditorAccounts(clock, []);

    await expect(accounts.createInitialUser("admin", "short")).rejects.toThrow();
  });
});

