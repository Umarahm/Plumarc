import { AccessTag } from "@/components/access-tag";
import { PageShell } from "@/components/page-shell";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SignedOutView() {
  return (
    <PageShell>
      <div className="my-auto grid items-center gap-12 md:grid-cols-2">
        <div className="flex flex-col items-start gap-6">
          <h1 className="text-4xl font-medium text-balance">
            Company answers, limited to what you are allowed to see
          </h1>
          <p className="max-w-md text-lg text-muted-foreground">
            Sign in to view your role and the documents it can open
          </p>
          {/* A full navigation: the Auth0 route must not be prefetched. */}
          <a href="/auth/login" className={buttonVariants({ size: "lg" })}>
            Sign in
          </a>
        </div>

        <figure className="flex flex-col gap-3">
          <Card>
            <CardHeader>
              <CardTitle>What time does the office open?</CardTitle>
              <CardDescription>
                The office opens at 9:30 on working days.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="rounded-lg bg-muted px-3 py-2 font-mono text-xs">
                Source: Employee handbook, section 2
              </p>
            </CardContent>
            <CardFooter>
              <AccessTag role="employee" organization="Northwind" />
            </CardFooter>
          </Card>
          <figcaption className="text-xs text-muted-foreground">
            Example of a planned answer, not built yet
          </figcaption>
        </figure>
      </div>
    </PageShell>
  );
}
