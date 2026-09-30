import { describe, expect, it } from "vitest";
import { createServices } from "./services";
import type { DbClient } from "./db";

describe("createServices", () => {
  const fakeDb = {} as DbClient;

  it("produces null contents when GITHUB_PAT is absent", () => {
    const services = createServices(undefined, { db: fakeDb });
    expect(services.contents).toBeNull();
  });

  it("throws when GITHUB_PAT is present but GITHUB_REPO is missing", () => {
    const fakeLocals = {
      runtime: {
        env: {
          GITHUB_PAT: "test-pat",
        },
      },
    } as unknown as App.Locals;

    expect(() => createServices(fakeLocals, { db: fakeDb })).toThrow(
      "Configuration Error: GITHUB_REPO must be defined when GITHUB_PAT is set."
    );
  });

  it("initializes contents when GITHUB_PAT and GITHUB_REPO are both present", () => {
    const fakeLocals = {
      runtime: {
        env: {
          GITHUB_PAT: "test-pat",
          GITHUB_REPO: "owner/repo",
        },
      },
    } as unknown as App.Locals;

    const services = createServices(fakeLocals, { db: fakeDb });
    expect(services.contents).not.toBeNull();
  });

  it("accepts repo via overrides", () => {
    const fakeLocals = {
      runtime: {
        env: {
          GITHUB_PAT: "test-pat",
        },
      },
    } as unknown as App.Locals;

    const services = createServices(fakeLocals, { db: fakeDb, repo: "owner/override-repo" });
    expect(services.contents).not.toBeNull();
  });
});
