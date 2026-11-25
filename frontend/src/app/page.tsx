import { Suspense } from "react";
import { connection } from "next/server";
import { AccountView } from "@/components/account-view";
import { SignedOutView } from "@/components/signed-out-view";
import { PageShell } from "@/components/page-shell";
import { getOverview } from "@/lib/api";
import { auth0 } from "@/lib/auth0";
import { csrfToken } from "@/lib/csrf";

export default function Home() {
  return (
    <Suspense
      fallback={
        <PageShell>
          <p role="status" className="text-muted-foreground">
            Loading your access
          </p>
        </PageShell>
      }
    >
      <Content />
    </Suspense>
  );
}

async function Content() {
  await connection();
  const session = await auth0.getSession();
  if (!session) return <SignedOutView />;

  return (
    <AccountView
      user={session.user}
      csrfToken={csrfToken(session.internal.sid)}
      overview={await getOverview()}
    />
  );
}
