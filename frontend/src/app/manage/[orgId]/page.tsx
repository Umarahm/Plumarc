import { ManagePage } from "@/components/manage/manage-page";
import { OrganizationView } from "@/components/manage/organization-view";
import { load, type OrganizationDetail } from "@/lib/api";
import { isId } from "@/lib/manage-actions";

export default function Organization({ params, searchParams }: PageProps<"/manage/[orgId]">) {
  return (
    <ManagePage
      searchParams={searchParams}
      fetch={async () => {
        const { orgId } = await params;
        // The id becomes part of a backend URL.
        if (!isId(orgId)) return { status: "not-found" };
        return load<OrganizationDetail>(`/v1/admin/organizations/${orgId}`);
      }}
      render={(organization, context) => (
        <OrganizationView organization={organization} {...context} />
      )}
    />
  );
}
