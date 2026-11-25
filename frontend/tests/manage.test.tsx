import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/manage/route";
import { OrganizationListView } from "@/components/manage/organization-list-view";
import { OrganizationView } from "@/components/manage/organization-view";
import type { OrganizationDetail } from "@/lib/api";
import { parseAction } from "@/lib/manage-actions";
import { errorMessage, ERROR_MESSAGES } from "@/lib/manage-errors";

const auth0 = vi.hoisted(() => ({ getAccessToken: vi.fn() }));
vi.mock("@/lib/auth0", () => ({ auth0 }));
vi.mock("server-only", () => ({}));

const ORG = "10000000-0000-0000-0000-000000000001";
const ITEM = "20000000-0000-0000-0000-000000000002";
const BASE = `/v1/admin/organizations/${ORG}`;

function form(values: Record<string, string>, roles: string[] = []) {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  for (const role of roles) data.append("roles", role);
  return data;
}

describe("parseAction", () => {
  it.each([
    ["member.add", "POST", `${BASE}/members`],
    ["member.role", "PATCH", `${BASE}/members/${ITEM}`],
    ["member.remove", "DELETE", `${BASE}/members/${ITEM}`],
    ["document.create", "POST", `${BASE}/documents`],
    ["document.update", "PUT", `${BASE}/documents/${ITEM}`],
    ["document.delete", "DELETE", `${BASE}/documents/${ITEM}`],
  ])("maps %s", (intent, method, path) => {
    const action = parseAction(form({ intent, org_id: ORG, user_id: ITEM, document_id: ITEM }));
    expect(action).toMatchObject({ method, path, back: `/manage/${ORG}` });
  });

  it("sends every ticked role", () => {
    const data = form({ intent: "document.create", org_id: ORG, title: "T", classification: "public" }, ["hr", "intern"]);
    expect(parseAction(data)?.body).toEqual({ title: "T", classification: "public", roles: ["hr", "intern"] });
  });

  it("requires confirmation to delete an organization", () => {
    expect(parseAction(form({ intent: "organization.delete", org_id: ORG }))).toBeNull();
    const confirmed = parseAction(form({ intent: "organization.delete", org_id: ORG, confirm: "yes" }));
    expect(confirmed).toMatchObject({ method: "DELETE", path: BASE, done: "/manage" });
  });

  it.each(["", "../../health", `${ORG}/members`, "https://evil.example"])(
    "rejects the id %j",
    (bad) => {
      expect(parseAction(form({ intent: "member.add", org_id: bad }))).toBeNull();
      expect(parseAction(form({ intent: "member.remove", org_id: ORG, user_id: bad }))).toBeNull();
      expect(parseAction(form({ intent: "document.delete", org_id: ORG, document_id: bad }))).toBeNull();
    },
  );

  it("rejects an unknown intent", () => {
    expect(parseAction(form({ intent: "user.promote", org_id: ORG }))).toBeNull();
  });
});

describe("POST /api/manage", () => {
  const fetchMock = vi.fn();
  const submit = (values: Record<string, string>) =>
    POST(new Request("http://localhost/api/manage", { method: "POST", body: form(values) }));
  const create = { intent: "organization.create", name: "Acme" };

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock.mockReset());
    vi.stubEnv("API_URL", "http://api.test");
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth0.getAccessToken.mockReset().mockResolvedValue({ token: "t" });
  });

  it("sends the change and redirects with 303", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));
    const response = await submit(create);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/manage");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/v1/admin/organizations");
    expect(init).toMatchObject({ method: "POST", body: '{"name":"Acme"}' });
  });

  it.each([
    [409, { detail: "name_taken" }, "name_taken"],
    [409, { detail: "<script>" }, "unavailable"],
    [422, {}, "invalid"],
    [403, {}, "forbidden"],
    [404, {}, "not_found"],
    [401, {}, "expired"],
    [503, {}, "unavailable"],
  ])("reports a %i as %s", async (status, body, code) => {
    fetchMock.mockResolvedValue(Response.json(body, { status }));
    expect((await submit(create)).headers.get("location")).toBe(`/manage?error=${code}`);
  });

  it("rejects an unusable form without calling the backend", async () => {
    expect((await submit({ intent: "nope" })).status).toBe(400);
    const junk = new Request("http://localhost/api/manage", { method: "POST", body: "{}" });
    expect((await POST(junk)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("error messages", () => {
  it("never shows text taken from the URL", () => {
    expect(errorMessage(undefined)).toBeNull();
    expect(errorMessage("invalid")).toBe(ERROR_MESSAGES.invalid);
    for (const value of ["<b>x</b>", "toString", ["invalid"]]) {
      expect(errorMessage(value)).toBe(ERROR_MESSAGES.unavailable);
    }
  });
});

describe("management views", () => {
  const organization: OrganizationDetail = {
    id: ORG,
    name: "Acme",
    members: [{ user_id: ITEM, user_sub: "auth0|me", display_name: "Me", role: "admin" }],
    documents: [{ id: ITEM, title: "Leave policy", classification: "internal", roles: ["hr"] }],
  };
  const render = (platform_admin: boolean) =>
    renderToStaticMarkup(
      <OrganizationView organization={organization} account={{ user_id: ITEM, platform_admin }} csrfToken="token-123" />,
    );

  it("puts the CSRF token in every form", () => {
    const html = render(true);
    const forms = html.match(/<form[\s\S]*?<\/form>/g) ?? [];
    expect(forms.length).toBeGreaterThan(5);
    for (const markup of forms) {
      expect(markup).toContain('name="csrf_token" value="token-123"');
      expect(markup).toContain('action="/api/manage"');
    }
  });

  it("hides organization deletion and self-removal from an organization admin", () => {
    const html = render(false);
    expect(html).not.toContain("organization.delete");
    expect(html).not.toContain("member.remove");
    expect(html).toContain("member.add");
    expect(render(true)).toContain("organization.delete");
  });

  it("offers creation only to the platform admin", () => {
    const list = (canCreate: boolean) =>
      renderToStaticMarkup(<OrganizationListView organizations={[]} canCreate={canCreate} csrfToken="t" />);
    expect(list(true)).toContain("organization.create");
    expect(list(false)).not.toContain("organization.create");
  });
});
