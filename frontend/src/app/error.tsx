"use client";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <PageShell>
      <div role="alert" className="flex flex-col items-start gap-4">
        <h1 className="text-2xl font-medium">This page could not load</h1>
        <p className="text-muted-foreground">Try again in a moment</p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </PageShell>
  );
}
