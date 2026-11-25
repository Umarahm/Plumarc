import Link from "next/link";
import { ActionForm } from "@/components/manage/action-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Organization } from "@/lib/api";

export function OrganizationListView({
  organizations,
  canCreate,
  csrfToken,
}: {
  organizations: Organization[];
  canCreate: boolean;
  csrfToken: string;
}) {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-medium">Organizations</h1>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{canCreate ? "All organizations" : "Your organization"}</h2>
          </CardTitle>
          <CardDescription>Open one to manage its people and documents</CardDescription>
        </CardHeader>
        <CardContent>
          {organizations.length === 0 ? (
            <p className="text-muted-foreground">No organizations yet</p>
          ) : (
            <ul className="divide-y divide-foreground/10">
              {organizations.map((organization) => (
                <li key={organization.id}>
                  <Link
                    href={`/manage/${organization.id}`}
                    className="flex min-h-12 items-center py-2 underline-offset-4 hover:underline"
                  >
                    {organization.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {canCreate && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>New organization</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm
              csrfToken={csrfToken}
              intent="organization.create"
              className="flex flex-col items-start gap-3 sm:flex-row sm:items-end"
            >
              <label className="flex w-full max-w-sm flex-col gap-2">
                Name
                <Input name="name" required maxLength={200} />
              </label>
              <Button type="submit">Create organization</Button>
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
