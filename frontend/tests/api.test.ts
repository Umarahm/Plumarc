import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOverview } from "@/lib/api";

const auth0 = vi.hoisted(() => ({ getAccessToken: vi.fn() }));
vi.mock("@/lib/auth0", () => ({ auth0 }));
vi.mock("server-only", () => ({}));

const account = { sub: "auth0|1", membership: null, actions: [] as string[] };
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock.mockReset());
  vi.stubEnv("API_URL", "http://api.test");
  vi.spyOn(console, "error").mockImplementation(() => {});
  auth0.getAccessToken.mockReset().mockResolvedValue({ token: "secret-token" });
});

describe("getOverview", () => {
  it("sends the token and skips documents the user may not list", async () => {
    fetchMock.mockResolvedValue(Response.json(account));
    expect(await getOverview()).toEqual({ status: "ok", account, documents: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer secret-token");
  });

  it("loads documents when allowed", async () => {
    const documents = [{ id: "1", title: "Handbook", classification: "internal" }];
    fetchMock
      .mockResolvedValueOnce(Response.json({ ...account, actions: ["documents:list"] }))
      .mockResolvedValueOnce(Response.json(documents));
    expect(await getOverview()).toMatchObject({ status: "ok", documents });
  });

  it("reports an expired session when no token can be obtained", async () => {
    auth0.getAccessToken.mockRejectedValue(new Error("expired"));
    expect(await getOverview()).toEqual({ status: "expired" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports an expired session on 401", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    expect(await getOverview()).toEqual({ status: "expired" });
  });

  it.each([
    ["a server error", () => fetchMock.mockResolvedValue(new Response(null, { status: 503 }))],
    ["a network error", () => fetchMock.mockRejectedValue(new TypeError("offline"))],
  ])("reports unavailable on %s", async (_, arrange) => {
    arrange();
    expect(await getOverview()).toEqual({ status: "unavailable" });
  });
});
