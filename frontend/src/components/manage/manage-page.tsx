import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProblemNotice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { SessionActions } from "@/components/session-actions";
import { load, type Account, type Loaded } from "@/lib/api";
import { auth0 } from "@/lib/auth0";
import { csrfToken } from "@/lib/csrf";
import { errorMessage } from "@/lib/manage-errors";

type Query = Promise<{ error?: string | string[] }>;

type PageProps<T> = {
  searchParams: Query;
  fetch: () => Promise<Loaded<T>>;
  render: (data: T, context: { account: Account; csrfToken: string }) => React.ReactNode;
};

/** The frame both management pages share: session, data, problems and messages. */
export function ManagePage<T>(props: PageProps<T>) {
  return (
    <Suspense
      fallback={
        <PageShell>
          <p role="status" className="text-muted-foreground">
            Loading
          </p>
        </PageShell>
      }
    >
      <Content {...props} />
    </Suspense>
  );
}

async function Content<T>({ searchParams, fetch, render }: PageProps<T>) {
  await connection();
  const session = await auth0.getSession();
  if (!session) redirect("/");

  const token = csrfToken(session.internal.sid);
  const [account, result, query] = await Promise.all([
    load<Account>("/v1/me"),
    fetch(),
    searchParams,
  ]);
  const error = errorMessage(query.error);

  return (
    <PageShell actions={<SessionActions user={session.user} csrfToken={token} />}>
      {error && (
        <p
          role="alert"
          className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive"
        >
          {error}
        </p>
      )}
      {account.status !== "ok" ? (
        <ProblemNotice problem={account.status} />
      ) : result.status !== "ok" ? (
        <ProblemNotice problem={result.status} />
      ) : (
        render(result.data, { account: account.data, csrfToken: token })
      )}
    </PageShell>
  );
}
