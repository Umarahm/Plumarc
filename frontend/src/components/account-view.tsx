import Link from "next/link";
import { AccessTag } from "@/components/access-tag";
import { Notice, ProblemNotice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { SessionActions } from "@/components/session-actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Overview } from "@/lib/api";
import { label } from "@/lib/roles";

export function AccountView({
  user,
  csrfToken,
  overview,
}: {
  user: { name?: string; email?: string };
  csrfToken: string;
  overview: Overview;
}) {
  const canManage =
    overview.status === "ok" && overview.account.actions.includes("organization:manage");
  return (
    <PageShell
      actions={<SessionActions user={user} csrfToken={csrfToken} canManage={canManage} />}
    >
      <Body overview={overview} />
    </PageShell>
  );
}

function Body({ overview }: { overview: Overview }) {
  if (overview.status !== "ok") return <ProblemNotice problem={overview.status} />;

  const { account, documents } = overview;
  if (!account.membership) {
    return (
      <Notice
        title="No organization yet"
        text={
          account.platform_admin
            ? "You are the platform admin. Add yourself to an organization to open its documents"
            : "Ask an administrator to add this user ID to an organization"
        }
      >
        <code className="rounded-lg bg-muted px-3 py-2 font-mono text-sm break-all">
          {account.sub}
        </code>
        {account.platform_admin && (
          <Link href="/manage" className={buttonVariants()}>
            Manage organizations
          </Link>
        )}
      </Notice>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-medium">Your access</h1>
        <AccessTag
          role={account.membership.role}
          organization={account.membership.org_name}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Documents you can open</h2>
          </CardTitle>
          <CardDescription>
            Filtered by the database for your role
          </CardDescription>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-muted-foreground">
              No documents are shared with your role
            </p>
          ) : (
            <ul className="divide-y divide-foreground/10">
              {documents.map((document) => (
                <li
                  key={document.id}
                  className="flex min-h-12 items-center justify-between gap-4 py-2"
                >
                  <span>{document.title}</span>
                  <Badge variant="outline">{label(document.classification)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
