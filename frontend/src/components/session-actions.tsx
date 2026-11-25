import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { CSRF_FIELD } from "@/lib/csrf-names";

export function SessionActions({
  user,
  csrfToken,
  canManage = false,
}: {
  user: { name?: string; email?: string };
  csrfToken: string;
  canManage?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 sm:gap-4">
      <span className="hidden text-sm text-muted-foreground sm:inline">
        {user.email ?? user.name}
      </span>
      {canManage && (
        <Link href="/manage" className={buttonVariants({ variant: "ghost" })}>
          Manage
        </Link>
      )}
      <form method="post" action="/auth/logout">
        <input type="hidden" name={CSRF_FIELD} value={csrfToken} />
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </div>
  );
}
