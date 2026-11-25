import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { csrfToken } from "@/lib/csrf";
import { proxy } from "@/proxy";

const auth0 = vi.hoisted(() => ({
  middleware: vi.fn(),
  getSession: vi.fn(),
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/auth0", () => ({ auth0 }));

const APP = "http://localhost:3000";
const session = { internal: { sid: "session-1" } };

function post(path: string, { token, origin = APP, header = false }: { token?: string; origin?: string; header?: boolean } = {}) {
  const headers: Record<string, string> = { origin };
  let body: URLSearchParams | undefined;
  if (token && header) headers["x-csrf-token"] = token;
  else if (token) body = new URLSearchParams({ csrf_token: token });
  return new NextRequest(`${APP}${path}`, { method: "POST", headers, body });
}

beforeEach(() => {
  vi.stubEnv("AUTH0_SECRET", "a".repeat(64));
  vi.stubEnv("APP_BASE_URL", APP);
  auth0.getSession.mockReset().mockResolvedValue(session);
  auth0.getAccessToken.mockReset().mockResolvedValue({ token: "t" });
  auth0.middleware.mockReset().mockImplementation(async () => NextResponse.next());
});

describe("CSRF protection", () => {
  it.each([
    ["no token", () => post("/auth/logout")],
    ["a wrong token", () => post("/auth/logout", { token: "nope" })],
    ["a foreign origin", () => post("/auth/logout", { token: csrfToken("session-1"), origin: "https://evil.example" })],
    ["another path without a token", () => post("/api/anything")],
  ])("blocks a POST with %s", async (_, request) => {
    expect((await proxy(request())).status).toBe(403);
    expect(auth0.middleware).not.toHaveBeenCalled();
  });

  it("blocks a POST without a session", async () => {
    auth0.getSession.mockResolvedValue(null);
    const response = await proxy(post("/api/anything", { token: csrfToken("session-1") }));
    expect(response.status).toBe(403);
  });

  it("accepts a valid token sent as a header", async () => {
    const response = await proxy(post("/api/anything", { token: csrfToken("session-1"), header: true }));
    expect(response.status).toBe(200);
  });
});

describe("logout", () => {
  it.each(["/auth/logout", "/auth/logout/"])("refuses GET %s", async (path) => {
    expect((await proxy(new NextRequest(`${APP}${path}`))).status).toBe(405);
    expect(auth0.middleware).not.toHaveBeenCalled();
  });

  it("hands a verified POST to the SDK as a clean GET and answers 303", async () => {
    auth0.middleware.mockImplementation(async () => {
      const redirect = NextResponse.redirect("https://tenant.example/logout");
      redirect.cookies.delete("__session");
      return redirect;
    });
    const response = await proxy(post("/auth/logout?returnTo=https://evil.example", { token: csrfToken("session-1") }));

    const forwarded: NextRequest = auth0.middleware.mock.calls[0][0];
    expect(forwarded.method).toBe("GET");
    expect(forwarded.nextUrl.search).toBe("");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://tenant.example/logout");
    expect(response.headers.get("set-cookie")).toContain("__session=");
  });
});

describe("token refresh", () => {
  it("refreshes on page requests with a session", async () => {
    const request = new NextRequest(`${APP}/`);
    const response = await proxy(request);
    expect(auth0.getAccessToken).toHaveBeenCalledWith(request, response);
  });

  it("does nothing when signed out", async () => {
    auth0.getSession.mockResolvedValue(null);
    await proxy(new NextRequest(`${APP}/`));
    expect(auth0.getAccessToken).not.toHaveBeenCalled();
  });

  it("leaves Auth0 routes to the SDK", async () => {
    await proxy(new NextRequest(`${APP}/auth/login`));
    expect(auth0.getAccessToken).not.toHaveBeenCalled();
  });

  it("still serves the page when refresh fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth0.getAccessToken.mockRejectedValue(new Error("revoked"));
    expect((await proxy(new NextRequest(`${APP}/`))).status).toBe(200);
  });
});
