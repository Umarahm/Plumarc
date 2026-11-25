// Turns a submitted management form into one backend request.
export type ManageAction = {
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  /** Page to return to. `done` replaces it after success. */
  back: string;
  done?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE = "/v1/admin/organizations";

export const isId = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);

export function parseAction(form: FormData): ManageAction | null {
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  const intent = text("intent");

  if (intent === "organization.create") {
    return { method: "POST", path: BASE, body: { name: text("name") }, back: "/manage" };
  }

  // Ids go into URLs, so anything that is not an id is rejected here.
  const org = text("org_id");
  if (!isId(org)) return null;
  const path = `${BASE}/${org}`;
  const back = `/manage/${org}`;

  const member = () => (isId(text("user_id")) ? `${path}/members/${text("user_id")}` : null);
  const document = () =>
    isId(text("document_id")) ? `${path}/documents/${text("document_id")}` : null;
  const documentBody = () => ({
    title: text("title"),
    classification: text("classification"),
    roles: form.getAll("roles"),
  });

  switch (intent) {
    case "organization.delete":
      if (text("confirm") !== "yes") return null;
      return { method: "DELETE", path, back, done: "/manage" };
    case "member.add": {
      const body = {
        user_sub: text("user_sub"),
        display_name: text("display_name"),
        role: text("role"),
      };
      return { method: "POST", path: `${path}/members`, body, back };
    }
    case "member.role": {
      const target = member();
      return target ? { method: "PATCH", path: target, body: { role: text("role") }, back } : null;
    }
    case "member.remove": {
      const target = member();
      return target ? { method: "DELETE", path: target, back } : null;
    }
    case "document.create":
      return { method: "POST", path: `${path}/documents`, body: documentBody(), back };
    case "document.update": {
      const target = document();
      return target ? { method: "PUT", path: target, body: documentBody(), back } : null;
    }
    case "document.delete": {
      const target = document();
      return target ? { method: "DELETE", path: target, back } : null;
    }
    default:
      return null;
  }
}
