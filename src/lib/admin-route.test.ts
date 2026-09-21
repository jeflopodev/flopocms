import { describe, expect, it, vi } from "vitest";
import { adminRoute, readJson } from "./admin-route";

const mocks = vi.hoisted(() => ({ services: { marker: "the composition root" } }));
vi.mock("./services", () => ({ createServices: () => mocks.services }));

type Route = ReturnType<typeof adminRoute>;

async function call(
  route: Route,
  options: { body?: string; user?: boolean } = {}
): Promise<{ status: number; body: any }> {
  const request = new Request("http://localhost/api/admin/thing", {
    method: "POST",
    body: options.body,
  });

  const locals = options.user === false ? {} : { user: { id: "user-1", username: "jeflopo" } };
  const response = await (route as any)({ request, locals, params: {} });

  return { status: response.status, body: await response.json() };
}

describe("adminRoute", () => {
  it("answers a returned object as JSON with 200", async () => {
    const route = adminRoute(async () => ({ success: true, slug: "untitled-article" }));

    expect(await call(route)).toEqual({
      status: 200,
      body: { success: true, slug: "untitled-article" },
    });
  });

  it("takes the status from a result that carries one", async () => {
    // Post Lifecycle's results carry theirs, which is why a route never maps it again.
    const route = adminRoute(async () => ({ success: false, status: 422, error: "Cannot publish" }));

    expect(await call(route)).toMatchObject({ status: 422, body: { error: "Cannot publish" } });
  });

  it("hands a Response straight back, headers and all", async () => {
    const route = adminRoute(async () => new Response("over here", { status: 302, headers: { Location: "/admin/posts" } }));

    const request = new Request("http://localhost/api/admin/thing");
    const response = await (route as any)({
      request,
      locals: { user: { id: "user-1", username: "jeflopo" } },
      params: {},
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/admin/posts");
  });

  it("narrows the Actor once, and does not run the handler without one", async () => {
    const handler = vi.fn(async () => ({ success: true }));
    const route = adminRoute(handler);

    expect(await call(route, { user: false })).toEqual({
      status: 401,
      body: { success: false, error: "Unauthorized" },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("gives the handler the Actor and the Services", async () => {
    const route = adminRoute(async ({ user, services }) => ({ user, services }));

    expect((await call(route)).body).toEqual({
      user: { id: "user-1", username: "jeflopo" },
      services: mocks.services,
    });
  });

  it("turns a thrown error into a readable 500 instead of letting it escape", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const route = adminRoute(async () => {
      throw new Error("D1 is unavailable");
    });

    expect(await call(route)).toEqual({
      status: 500,
      body: { success: false, error: "D1 is unavailable" },
    });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe("readJson", () => {
  it("decodes a JSON body", async () => {
    const request = new Request("http://localhost/api/admin/thing", {
      method: "POST",
      body: JSON.stringify({ id: "post-1" }),
    });

    expect(await readJson(request)).toEqual({ ok: true, value: { id: "post-1" } });
  });

  it("reports a body that is not JSON rather than throwing", async () => {
    const request = new Request("http://localhost/api/admin/thing", { method: "POST", body: "not json" });

    expect(await readJson(request)).toEqual({ ok: false, error: "Expected a JSON body" });
  });
});
