import { buttonVariants } from "@/components/ui/button";
import type { Failure } from "@/lib/api";

export function Notice({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-medium">{title}</h1>
      <p className="text-muted-foreground">{text}</p>
      {children}
    </div>
  );
}

const PROBLEMS: Record<Failure, { title: string; text: string; href: string; action: string }> = {
  expired: {
    title: "Your session ended",
    text: "Sign in again to continue",
    href: "/auth/login",
    action: "Sign in again",
  },
  forbidden: {
    title: "Not allowed",
    text: "Your role cannot manage this",
    href: "/",
    action: "Back to your access",
  },
  "not-found": {
    title: "Not found",
    text: "It does not exist, or your role cannot manage it",
    href: "/",
    action: "Back to your access",
  },
  unavailable: {
    title: "Your access could not be checked",
    text: "The account service did not respond, so nothing is shown",
    href: "/",
    action: "Try again",
  },
};

export function ProblemNotice({ problem }: { problem: Failure }) {
  const { title, text, href, action } = PROBLEMS[problem];
  return (
    <Notice title={title} text={text}>
      {/* A full navigation: Auth0 routes must not be prefetched, and retry needs a reload. */}
      <a href={href} className={buttonVariants()}>
        {action}
      </a>
    </Notice>
  );
}
