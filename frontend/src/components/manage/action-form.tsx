import { Button, buttonVariants } from "@/components/ui/button";
import { CSRF_FIELD } from "@/lib/csrf-names";

/** A plain HTML form to /api/manage: no client code, and the browser handles the redirect. */
export function ActionForm({
  csrfToken,
  intent,
  ids = {},
  className,
  children,
}: {
  csrfToken: string;
  intent: string;
  ids?: Record<string, string>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form method="post" action="/api/manage" className={className}>
      <input type="hidden" name={CSRF_FIELD} value={csrfToken} />
      <input type="hidden" name="intent" value={intent} />
      {Object.entries(ids).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
    </form>
  );
}

/** Two clicks to remove something: open, then confirm. */
export function ConfirmRemove({
  csrfToken,
  intent,
  ids,
  action,
  warning,
}: {
  csrfToken: string;
  intent: string;
  ids: Record<string, string>;
  action: string;
  warning: string;
}) {
  return (
    <details className="text-sm">
      <summary className={buttonVariants({ variant: "ghost", size: "sm" })}>{action}</summary>
      <ActionForm
        csrfToken={csrfToken}
        intent={intent}
        ids={ids}
        className="mt-2 flex flex-wrap items-center gap-3"
      >
        <span className="text-muted-foreground">{warning}</span>
        <Button type="submit" variant="destructive" size="sm">
          Confirm
        </Button>
      </ActionForm>
    </details>
  );
}
