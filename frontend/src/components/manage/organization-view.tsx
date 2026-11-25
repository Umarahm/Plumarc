import Link from "next/link";
import { ActionForm, ConfirmRemove } from "@/components/manage/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { Account, OrganizationDetail } from "@/lib/api";
import { CLASSIFICATIONS, label, ROLES, type Role } from "@/lib/roles";

type Props = {
  organization: OrganizationDetail;
  account: Pick<Account, "user_id" | "platform_admin">;
  csrfToken: string;
};

export function OrganizationView({ organization, account, csrfToken }: Props) {
  const ids = { org_id: organization.id };
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-start gap-2">
        <Link href="/manage" className="text-sm text-muted-foreground hover:underline">
          All organizations
        </Link>
        <h1 className="text-2xl font-medium break-words">{organization.name}</h1>
      </div>

      <People organization={organization} account={account} csrfToken={csrfToken} />
      <Documents organization={organization} csrfToken={csrfToken} />

      {account.platform_admin && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Delete organization</h2>
            </CardTitle>
            <CardDescription>
              Removes its memberships and documents. This cannot be undone
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm
              csrfToken={csrfToken}
              intent="organization.delete"
              ids={ids}
              className="flex flex-col items-start gap-3"
            >
              <label className="flex items-center gap-2">
                <input type="checkbox" name="confirm" value="yes" required />
                Delete {organization.name} permanently
              </label>
              <Button type="submit" variant="destructive">
                Delete organization
              </Button>
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RoleSelect({ value = "employee" }: { value?: Role }) {
  return (
    <NativeSelect name="role" defaultValue={value}>
      {ROLES.map((role) => (
        <NativeSelectOption key={role} value={role}>
          {label(role)}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function People({ organization, account, csrfToken }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>People</h2>
        </CardTitle>
        <CardDescription>A role decides which documents a person can open</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {organization.members.length === 0 ? (
          <p className="text-muted-foreground">Nobody belongs to this organization yet</p>
        ) : (
          <ul className="divide-y divide-foreground/10">
            {organization.members.map((member) => {
              const ids = { org_id: organization.id, user_id: member.user_id };
              const isSelf = member.user_id === account.user_id;
              return (
                <li
                  key={member.user_id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col">
                    <span>
                      {member.display_name}
                      {isSelf && " (you)"}
                    </span>
                    <code className="font-mono text-xs break-all text-muted-foreground">
                      {member.user_sub}
                    </code>
                  </div>
                  {isSelf && !account.platform_admin ? (
                    <Badge variant="outline">{label(member.role)}</Badge>
                  ) : (
                    <div className="flex flex-wrap items-start gap-2">
                      <ActionForm
                        csrfToken={csrfToken}
                        intent="member.role"
                        ids={ids}
                        className="flex items-center gap-2"
                      >
                        <label>
                          <span className="sr-only">Role of {member.display_name}</span>
                          <RoleSelect value={member.role} />
                        </label>
                        <Button type="submit" variant="outline">
                          Save role
                        </Button>
                      </ActionForm>
                      <ConfirmRemove
                        csrfToken={csrfToken}
                        intent="member.remove"
                        ids={ids}
                        action="Remove"
                        warning={`${member.display_name} will lose access`}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <ActionForm
          csrfToken={csrfToken}
          intent="member.add"
          ids={{ org_id: organization.id }}
          className="flex flex-col items-start gap-3 border-t border-foreground/10 pt-6"
        >
          <h3 className="font-medium">Add a person</h3>
          <p className="text-muted-foreground">
            They sign in once and send you the user ID shown on their home page
          </p>
          <div className="grid w-full gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              User ID
              <Input name="user_sub" required maxLength={255} autoComplete="off" />
            </label>
            <label className="flex flex-col gap-2">
              Name
              <Input name="display_name" required maxLength={200} autoComplete="off" />
            </label>
          </div>
          <label className="flex flex-col gap-2">
            Role
            <RoleSelect />
          </label>
          <Button type="submit">Add person</Button>
        </ActionForm>
      </CardContent>
    </Card>
  );
}

function DocumentFields({
  document,
}: {
  document?: OrganizationDetail["documents"][number];
}) {
  return (
    <>
      <div className="grid w-full gap-3 sm:grid-cols-[1fr_auto]">
        <label className="flex flex-col gap-2">
          Title
          <Input name="title" required maxLength={200} defaultValue={document?.title} />
        </label>
        <label className="flex flex-col gap-2">
          Classification
          <NativeSelect name="classification" defaultValue={document?.classification ?? "internal"}>
            {CLASSIFICATIONS.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {label(value)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      </div>
      <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
        <legend className="mb-2">Who can open it</legend>
        {ROLES.map((role) => (
          <label key={role} className="flex items-center gap-2">
            <input
              type="checkbox"
              name="roles"
              value={role}
              defaultChecked={document?.roles.includes(role)}
            />
            {label(role)}
          </label>
        ))}
      </fieldset>
    </>
  );
}

function Documents({ organization, csrfToken }: Omit<Props, "account">) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Documents</h2>
        </CardTitle>
        <CardDescription>
          Titles and access only. File upload is not built yet
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {organization.documents.length === 0 ? (
          <p className="text-muted-foreground">No documents yet</p>
        ) : (
          <ul className="divide-y divide-foreground/10">
            {organization.documents.map((document) => {
              const ids = { org_id: organization.id, document_id: document.id };
              return (
                <li key={document.id} className="py-3">
                  <details>
                    <summary className="flex min-h-8 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                      <span>{document.title}</span>
                      <Badge variant="outline">{label(document.classification)}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {document.roles.length
                          ? document.roles.map(label).join(", ")
                          : "No role can open it"}
                      </span>
                      <span className="ml-auto underline underline-offset-4">Edit</span>
                    </summary>
                    <div className="mt-4 flex flex-col items-start gap-3">
                      <ActionForm
                        csrfToken={csrfToken}
                        intent="document.update"
                        ids={ids}
                        className="flex w-full flex-col items-start gap-3"
                      >
                        <DocumentFields document={document} />
                        <Button type="submit" variant="outline">
                          Save document
                        </Button>
                      </ActionForm>
                      <ConfirmRemove
                        csrfToken={csrfToken}
                        intent="document.delete"
                        ids={ids}
                        action="Delete"
                        warning={`${document.title} will be deleted`}
                      />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}

        <ActionForm
          csrfToken={csrfToken}
          intent="document.create"
          ids={{ org_id: organization.id }}
          className="flex flex-col items-start gap-3 border-t border-foreground/10 pt-6"
        >
          <h3 className="font-medium">Add a document</h3>
          <DocumentFields />
          <Button type="submit">Add document</Button>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
