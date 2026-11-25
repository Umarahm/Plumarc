import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountView } from "@/components/account-view";
import { SignedOutView } from "@/components/signed-out-view";
import type { Overview } from "@/lib/api";

const account = {
  sub: "auth0|abc",
  user_id: null,
  membership: null,
  platform_admin: false,
  actions: [] as string[],
};

const render = (overview: Overview) =>
  renderToStaticMarkup(
    <AccountView user={{ email: "a@example.com" }} csrfToken="token-123" overview={overview} />,
  );

describe("views", () => {
  it("offers sign-in and labels the sample answer as an example", () => {
    const html = renderToStaticMarkup(<SignedOutView />);
    expect(html).toContain('href="/auth/login"');
    expect(html).toContain("Example of a planned answer");
  });

  it("signs out with a POST that carries the CSRF token", () => {
    const html = render({ status: "unavailable" });
    const form = html.match(/<form[^>]*>/)?.[0];
    expect(form).toContain('method="post"');
    expect(form).toContain('action="/auth/logout"');
    expect(html).toContain('name="csrf_token" value="token-123"');
  });

  it("shows role, organization and permitted documents", () => {
    const html = render({
      status: "ok",
      account: { ...account, membership: { org_id: "o", org_name: "Northwind", role: "intern" } },
      documents: [{ id: "1", title: "Handbook", classification: "internal" }],
    });
    for (const text of ["Intern", "Northwind", "Handbook", "Internal"]) expect(html).toContain(text);
    expect(html).not.toContain('href="/manage"');
  });

  it("shows the user ID when there is no membership", () => {
    const html = render({ status: "ok", account, documents: [] });
    expect(html).toContain("No organization yet");
    expect(html).toContain("auth0|abc");
    expect(html).not.toContain('href="/manage"');
  });

  it("links the platform admin to management", () => {
    const admin = { ...account, platform_admin: true, actions: ["organization:manage"] };
    expect(render({ status: "ok", account: admin, documents: [] })).toContain('href="/manage"');
  });

  it("offers sign-in again when the session ended", () => {
    expect(render({ status: "expired" })).toContain("Sign in again");
  });
});
