import "server-only";
import { auth0 } from "@/lib/auth0";
import type { ManageAction } from "@/lib/manage-actions";
import type { ErrorCode } from "@/lib/manage-errors";
import type { Classification, Role } from "@/lib/roles";

export type Account = {
  sub: string;
  user_id: string | null;
  membership: { org_id: string; org_name: string; role: string } | null;
  platform_admin: boolean;
  actions: string[];
};

export type CompanyDocument = {
  id: string;
  title: string;
  classification: string;
};

export type Organization = { id: string; name: string };

export type OrganizationDetail = Organization & {
  members: { user_id: string; user_sub: string; display_name: string; role: Role }[];
  documents: { id: string; title: string; classification: Classification; roles: Role[] }[];
};

export type Failure = "expired" | "forbidden" | "not-found" | "unavailable";

export type Loaded<T> = { status: "ok"; data: T } | { status: Failure };

export type Overview =
  | { status: "ok"; account: Account; documents: CompanyDocument[] }
  | { status: "expired" }
  | { status: "unavailable" };

class BackendError extends Error {
  constructor(
    readonly status: number,
    path: string,
    readonly detail?: unknown,
  ) {
    super(`${path} returned ${status}`);
  }
}

async function accessToken(): Promise<string | null> {
  try {
    return (await auth0.getAccessToken()).token;
  } catch (error) {
    console.error("Access token unavailable:", (error as Error).message);
    return null;
  }
}

async function call(path: string, token: string, method = "GET", body?: unknown) {
  const response = await fetch(`${process.env.API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null))?.detail;
    throw new BackendError(response.status, path, detail);
  }
  return response;
}

async function get<T>(path: string, token: string): Promise<T> {
  return (await call(path, token)).json() as Promise<T>;
}

function failure(error: unknown): Failure {
  const status = error instanceof BackendError ? error.status : 0;
  if (status === 401) return "expired";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  console.error("Backend request failed:", (error as Error).message);
  return "unavailable";
}

export async function load<T>(path: string): Promise<Loaded<T>> {
  const token = await accessToken();
  if (!token) return { status: "expired" };
  try {
    return { status: "ok", data: await get<T>(path, token) };
  } catch (error) {
    return { status: failure(error) };
  }
}

const CONFLICTS = ["name_taken", "already_member", "own_membership"] as const;

/** Performs a change. Returns null on success, otherwise why it failed. */
export async function send(action: ManageAction): Promise<ErrorCode | null> {
  const token = await accessToken();
  if (!token) return "expired";
  try {
    await call(action.path, token, action.method, action.body);
    return null;
  } catch (error) {
    if (error instanceof BackendError) {
      if (error.status === 422) return "invalid";
      if (error.status === 409) {
        return CONFLICTS.find((code) => code === error.detail) ?? "unavailable";
      }
    }
    const reason = failure(error);
    return reason === "not-found" ? "not_found" : reason;
  }
}

export async function getOverview(): Promise<Overview> {
  const token = await accessToken();
  if (!token) return { status: "expired" };

  try {
    const account = await get<Account>("/v1/me", token);
    const documents = account.actions.includes("documents:list")
      ? await get<CompanyDocument[]>("/v1/documents", token)
      : [];
    return { status: "ok", account, documents };
  } catch (error) {
    return failure(error) === "expired" ? { status: "expired" } : { status: "unavailable" };
  }
}
