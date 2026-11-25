import { label } from "@/lib/roles";

// The product's signature: every view of company data says whose access produced it.
export function AccessTag({
  role,
  organization,
}: {
  role: string;
  organization: string;
}) {
  return (
    <span className="inline-flex w-fit items-center rounded-md border border-secondary/60 text-xs">
      <span className="border-r border-secondary/60 px-2 py-1 font-medium">{label(role)}</span>
      <span className="px-2 py-1 text-muted-foreground">{organization}</span>
    </span>
  );
}
