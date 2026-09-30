import { and, desc, eq, gt, ne } from "drizzle-orm";
import { sessions as sessionsTable, type DbClient, users as usersTable } from "./db";
import { generateSalt, generateSessionToken, hashPassword, verifyPassword } from "./auth";
import { systemClock, type Clock } from "./clock";

/**
 * Editor Accounts.
 *
 * The one place an Editor is identified: credentials are verified here, sessions are
 * issued and revoked here, and the Account Store seam beneath stays private, so the
 * module can be exercised without a database. Every editorial route depends on it.
 *
 * Callers speak in tokens, never cookies: the transport belongs to the HTTP layer, which
 * is why the middleware is the only thing that reads `admin_session` and the only thing
 * that writes `locals.user`.
 */

export interface Editor {
  id: string;
  username: string;
}

/** The stored credential identity: a username, a password hash and the salt it used. */
export interface EditorAccount {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

/** How long a session lasts. A policy the module owns; moving it is a one-line change. */
export const SESSION_DAYS = 30;

const SESSION_MILLISECONDS = SESSION_DAYS * 24 * 60 * 60 * 1000;

export const MIN_PASSWORD_LENGTH = 8;

export type PasswordChange =
  | { ok: true }
  | { ok: false; reason: "wrong-password" | "too-short" | "no-such-editor" };

/**
 * One open session, as Profile & Security lists it.
 *
 * The token is deliberately absent: it is the credential, and a page that could render it
 * would be handing the session to anyone who can read the markup.
 */
export interface EditorSession {
  /** The session row's identity, which is safe to show and to name in a request. */
  id: string;
  createdAt: string;
  expiresAt: string;
  /** The session reading this page, so the list can label rather than trust it. */
  current: boolean;
}

export interface EditorProfile {
  editor: Editor;
  /** When the Editor Account was created. */
  createdAt: string;
  /** Sessions that have not expired, newest first, the caller's own included. */
  sessions: EditorSession[];
}

export interface EndSessionResult {
  /** False when the session is already gone, or belongs to another Editor. */
  ended: boolean;
  /** True when the Editor just ended the session they were using. */
  endedCurrent: boolean;
}

export interface SignInResult {
  /** Opaque. The caller puts it in a cookie or nowhere at all. */
  token: string;
  editor: Editor;
}

export interface EditorAccounts {
  /** Verifies credentials and issues a session. Null when either half is wrong. */
  signIn(username: string, password: string): Promise<SignInResult | null>;
  /** The Editor a token belongs to, or null when it is unknown or expired. */
  editorFor(token?: string): Promise<Editor | null>;
  signOut(token?: string): Promise<void>;
  /**
   * Re-derives the hash with a new salt, and ends every other session. `keepToken` is the
   * session making the change, which survives so the Editor is not signed out of the tab
   * they are looking at.
   */
  changePassword(input: {
    editorId: string;
    currentPassword: string;
    newPassword: string;
    keepToken?: string;
  }): Promise<PasswordChange>;
  /** What the Profile & Security page shows about the signed-in Editor. */
  profile(editorId: string, options?: { currentToken?: string }): Promise<EditorProfile | null>;
  /** Ends one session the Editor owns; another Editor's session is not theirs to end. */
  endSession(input: {
    editorId: string;
    sessionId: string;
    currentToken?: string;
  }): Promise<EndSessionResult>;
  /** Ends every session the Editor has, the one asking included. Answers how many ended. */
  endAllSessions(editorId: string): Promise<number>;
  /** Returns the total number of registered editor accounts. */
  count(): Promise<number>;
  /** Creates the very first administrator account if no users exist. Returns SignInResult or null if users already exist. */
  createInitialUser(username: string, password: string): Promise<SignInResult | null>;
}

/** A username is matched the way it is stored, so `Jeflopo` and ` jeflopo ` are one Editor. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * The pure policy: what an Editor Account is, with no store in sight.
 *
 * Salt width, iteration count and hash encoding live in `auth.ts`; this decides the shape
 * of the row around them, so the credentials module owns "how a password becomes an
 * account" rather than every provisioning path restating it.
 */
export async function editorAccountFrom(
  username: string,
  password: string,
  now: Date = new Date()
): Promise<EditorAccount> {
  const salt = generateSalt();

  return {
    id: crypto.randomUUID(),
    username: normalizeUsername(username),
    passwordHash: await hashPassword(password, salt),
    salt,
    createdAt: now.toISOString(),
  };
}

export function createD1EditorAccounts(db: DbClient, clock: Clock = systemClock): EditorAccounts {
  const sessionExpiry = () =>
    new Date(clock.now().getTime() + SESSION_MILLISECONDS).toISOString();

  async function accountRow(id: string) {
    const [row] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    return row ?? null;
  }

  return {
    async signIn(username, password) {
      const [row] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.username, normalizeUsername(username)))
        .limit(1);

      if (!row || !(await verifyPassword(password, row.salt, row.passwordHash))) return null;

      const token = generateSessionToken();
      await db.insert(sessionsTable).values({
        id: crypto.randomUUID(),
        userId: row.id,
        token,
        expiresAt: sessionExpiry(),
      });

      return { token, editor: { id: row.id, username: row.username } };
    },

    async editorFor(token) {
      if (!token) return null;

      const [row] = await db
        .select({
          sessionId: sessionsTable.id,
          expiresAt: sessionsTable.expiresAt,
          editorId: usersTable.id,
          username: usersTable.username,
        })
        .from(sessionsTable)
        .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
        .where(eq(sessionsTable.token, token))
        .limit(1);

      if (!row) return null;

      if (new Date(row.expiresAt).getTime() <= clock.now().getTime()) {
        await db.delete(sessionsTable).where(eq(sessionsTable.id, row.sessionId));
        return null;
      }

      return { id: row.editorId, username: row.username };
    },

    async signOut(token) {
      if (!token) return;
      await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
    },

    async changePassword({ editorId, currentPassword, newPassword, keepToken }) {
      if (newPassword.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: "too-short" };

      const row = await accountRow(editorId);
      if (!row) return { ok: false, reason: "no-such-editor" };

      if (!(await verifyPassword(currentPassword, row.salt, row.passwordHash))) {
        return { ok: false, reason: "wrong-password" };
      }

      const salt = generateSalt();
      await db
        .update(usersTable)
        .set({ passwordHash: await hashPassword(newPassword, salt), salt })
        .where(eq(usersTable.id, editorId));

      await db
        .delete(sessionsTable)
        .where(
          keepToken
            ? and(eq(sessionsTable.userId, editorId), ne(sessionsTable.token, keepToken))
            : eq(sessionsTable.userId, editorId)
        );

      return { ok: true };
    },

    async profile(editorId, options = {}) {
      const row = await accountRow(editorId);
      if (!row) return null;

      const open = await db
        .select({
          id: sessionsTable.id,
          token: sessionsTable.token,
          createdAt: sessionsTable.createdAt,
          expiresAt: sessionsTable.expiresAt,
        })
        .from(sessionsTable)
        .where(
          and(
            eq(sessionsTable.userId, editorId),
            gt(sessionsTable.expiresAt, clock.now().toISOString())
          )
        )
        .orderBy(desc(sessionsTable.createdAt));

      return {
        editor: { id: row.id, username: row.username },
        createdAt: row.createdAt,
        sessions: open.map((session) => ({
          id: session.id,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          current: session.token === options.currentToken,
        })),
      };
    },

    async endSession({ editorId, sessionId, currentToken }) {
      const [row] = await db
        .select({ token: sessionsTable.token })
        .from(sessionsTable)
        .where(and(eq(sessionsTable.id, sessionId), eq(sessionsTable.userId, editorId)))
        .limit(1);

      if (!row) return { ended: false, endedCurrent: false };

      await db.delete(sessionsTable).where(eq(sessionsTable.id, sessionId));
      return { ended: true, endedCurrent: row.token === currentToken };
    },

    async endAllSessions(editorId) {
      const open = await db
        .select({ id: sessionsTable.id })
        .from(sessionsTable)
        .where(eq(sessionsTable.userId, editorId));

      await db.delete(sessionsTable).where(eq(sessionsTable.userId, editorId));
      return open.length;
    },

    async count() {
      const rows = await db.select({ id: usersTable.id }).from(usersTable);
      return rows.length;
    },

    async createInitialUser(username, password) {
      if (!username || !password || password.length < MIN_PASSWORD_LENGTH) {
        throw new Error("Invalid username or password");
      }
      const existing = await this.count();
      if (existing > 0) {
        return null;
      }
      const salt = generateSalt();
      const passwordHash = await hashPassword(password, salt);
      const id = crypto.randomUUID();
      const normUser = normalizeUsername(username);

      await db.insert(usersTable).values({
        id,
        username: normUser,
        passwordHash,
        salt,
      });

      const token = generateSessionToken();
      await db.insert(sessionsTable).values({
        id: crypto.randomUUID(),
        userId: id,
        token,
        expiresAt: sessionExpiry(),
      });

      return {
        token,
        editor: { id, username: normUser },
      };
    },
  };
}

interface StoredSession {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

/**
 * Local substitute for Editor Accounts, with the same rules.
 *
 * It reads the time through the same Clock the D1 adapter does — the only reason the
 * session lifetime is testable at all, since a token is opaque and nothing else about a
 * session is observable from outside.
 */
export class InMemoryEditorAccounts implements EditorAccounts {
  private accounts = new Map<string, EditorAccount>();
  private sessions = new Map<string, StoredSession>();

  constructor(
    private readonly clock: Clock = systemClock,
    seed: EditorAccount[] = []
  ) {
    for (const account of seed) this.accounts.set(account.id, { ...account });
  }

  private byUsername(username: string): EditorAccount | undefined {
    return [...this.accounts.values()].find((account) => account.username === username);
  }

  private expires(): string {
    return new Date(this.clock.now().getTime() + SESSION_MILLISECONDS).toISOString();
  }

  private unexpired(session: StoredSession): boolean {
    return new Date(session.expiresAt).getTime() > this.clock.now().getTime();
  }

  private liveByToken(token?: string): StoredSession | undefined {
    if (!token) return undefined;
    const session = this.sessions.get(token);
    if (!session) return undefined;

    if (!this.unexpired(session)) {
      this.sessions.delete(token);
      return undefined;
    }
    return session;
  }

  private async issue(userId: string): Promise<string> {
    const token = generateSessionToken();
    this.sessions.set(token, {
      id: crypto.randomUUID(),
      userId,
      createdAt: this.clock.now().toISOString(),
      expiresAt: this.expires(),
    });
    return token;
  }

  async signIn(username: string, password: string): Promise<SignInResult | null> {
    const account = this.byUsername(normalizeUsername(username));
    if (!account) return null;
    if (!(await verifyPassword(password, account.salt, account.passwordHash))) return null;

    return {
      token: await this.issue(account.id),
      editor: { id: account.id, username: account.username },
    };
  }

  async editorFor(token?: string): Promise<Editor | null> {
    const session = this.liveByToken(token);
    if (!session) return null;

    const account = this.accounts.get(session.userId);
    return account ? { id: account.id, username: account.username } : null;
  }

  async signOut(token?: string): Promise<void> {
    if (token) this.sessions.delete(token);
  }

  async changePassword(input: {
    editorId: string;
    currentPassword: string;
    newPassword: string;
    keepToken?: string;
  }): Promise<PasswordChange> {
    const { editorId, currentPassword, newPassword, keepToken } = input;

    if (newPassword.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: "too-short" };

    const account = this.accounts.get(editorId);
    if (!account) return { ok: false, reason: "no-such-editor" };

    if (!(await verifyPassword(currentPassword, account.salt, account.passwordHash))) {
      return { ok: false, reason: "wrong-password" };
    }

    const salt = generateSalt();
    this.accounts.set(editorId, {
      ...account,
      salt,
      passwordHash: await hashPassword(newPassword, salt),
    });

    for (const [token, session] of this.sessions) {
      if (session.userId === editorId && token !== keepToken) this.sessions.delete(token);
    }

    return { ok: true };
  }

  async profile(
    editorId: string,
    options: { currentToken?: string } = {}
  ): Promise<EditorProfile | null> {
    const account = this.accounts.get(editorId);
    if (!account) return null;

    const open = [...this.sessions.entries()]
      .filter(([, session]) => session.userId === editorId && this.unexpired(session))
      .sort(([, a], [, b]) => b.createdAt.localeCompare(a.createdAt));

    return {
      editor: { id: account.id, username: account.username },
      createdAt: account.createdAt,
      sessions: open.map(([token, session]) => ({
        id: session.id,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        current: token === options.currentToken,
      })),
    };
  }

  async endSession(input: {
    editorId: string;
    sessionId: string;
    currentToken?: string;
  }): Promise<EndSessionResult> {
    const { editorId, sessionId, currentToken } = input;

    for (const [token, session] of this.sessions) {
      if (session.id !== sessionId || session.userId !== editorId) continue;

      this.sessions.delete(token);
      return { ended: true, endedCurrent: token === currentToken };
    }

    return { ended: false, endedCurrent: false };
  }

  async endAllSessions(editorId: string): Promise<number> {
    const mine = [...this.sessions.entries()].filter(([, session]) => session.userId === editorId);
    for (const [token] of mine) this.sessions.delete(token);

    return mine.length;
  }

  async count(): Promise<number> {
    return this.accounts.size;
  }

  async createInitialUser(username: string, password: string): Promise<SignInResult | null> {
    if (!username || !password || password.length < MIN_PASSWORD_LENGTH) {
      throw new Error("Invalid username or password");
    }
    if (this.accounts.size > 0) {
      return null;
    }
    const salt = generateSalt();
    const account: EditorAccount = {
      id: crypto.randomUUID(),
      username: normalizeUsername(username),
      passwordHash: await hashPassword(password, salt),
      salt,
      createdAt: this.clock.now().toISOString(),
    };
    this.accounts.set(account.id, account);
    return {
      token: await this.issue(account.id),
      editor: { id: account.id, username: account.username },
    };
  }

  /** Test helper: the sessions still stored, expired ones included. */
  storedSessions(): StoredSession[] {
    return [...this.sessions.values()];
  }
}
