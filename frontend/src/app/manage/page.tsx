import { ManagePage } from "@/components/manage/manage-page";
import { OrganizationListView } from "@/components/manage/organization-list-view";
import { load, type Organization } from "@/lib/api";

export default function Organizations({ searchParams }: PageProps<"/manage">) {
  return (
    <ManagePage
      searchParams={searchParams}
      fetch={() => load<Organization[]>("/v1/admin/organizations")}
      render={(organizations, { account, csrfToken }) => (
        <OrganizationListView
          organizations={organizations}
          canCreate={account.platform_admin}
          csrfToken={csrfToken}
        />
      )}
    />
  );
}
