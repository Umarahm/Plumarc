-- Management screens: platform admins and the write rules for organizations,
-- members and documents. Run once, after the first migration, as the owner.
begin;

-- The security definer functions below must be able to read past row-level security.
do $$
begin
    if not (select rolsuper or rolbypassrls from pg_roles where rolname = current_user) then
        raise exception 'Run this as a role that bypasses row-level security (postgres)';
    end if;
end $$;

alter table plumarc.users add column is_platform_admin boolean not null default false;

create function plumarc.is_platform_admin() returns boolean
    language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from plumarc.users u
        where u.id = plumarc.current_user_id() and u.is_platform_admin
    )
$$;

-- True only inside a management request, for a platform admin or that
-- organization's admin. Ordinary requests never set app.manage, so these rules
-- do not widen what the normal document list shows.
create function plumarc.can_manage(target uuid) returns boolean
    language sql stable security definer set search_path = '' as $$
    select coalesce(current_setting('app.manage', true) = 'on', false) and (
        plumarc.is_platform_admin() or exists (
            select 1 from plumarc.organization_members m
            where m.org_id = target
              and m.user_id = plumarc.current_user_id()
              and m.role = 'admin'
        )
    )
$$;

-- The only way the API can create a user. It never renames or moves someone who
-- already belongs to an organization.
create function plumarc.add_member(
    target uuid, subject text, name text, member_role plumarc.member_role
) returns uuid
    language plpgsql security definer set search_path = '' as $$
declare
    member_id uuid;
begin
    if not plumarc.can_manage(target) then
        raise insufficient_privilege using message = 'Not allowed to manage this organization';
    end if;

    insert into plumarc.users as u (auth0_sub, display_name)
    values (subject, name)
    on conflict (auth0_sub) do update set display_name = excluded.display_name
        where not exists (
            select 1 from plumarc.organization_members m where m.user_id = u.id
        );

    select id into member_id from plumarc.users where auth0_sub = subject;

    insert into plumarc.organization_members (org_id, user_id, role)
    values (target, member_id, member_role);
    return member_id;
end $$;

revoke execute on function plumarc.is_platform_admin() from public;
revoke execute on function plumarc.can_manage(uuid) from public;
revoke execute on function plumarc.add_member(uuid, text, text, plumarc.member_role) from public;
grant execute on function plumarc.is_platform_admin() to plumarc_api;
grant execute on function plumarc.can_manage(uuid) to plumarc_api;
grant execute on function plumarc.add_member(uuid, text, text, plumarc.member_role)
    to plumarc_api;

-- Organizations: admins read their own; only platform admins create or delete.
create policy manage_read on plumarc.organizations for select to plumarc_api
    using (plumarc.can_manage(id));
create policy platform_create on plumarc.organizations for insert to plumarc_api
    with check (plumarc.can_manage(id) and plumarc.is_platform_admin());
create policy platform_delete on plumarc.organizations for delete to plumarc_api
    using (plumarc.can_manage(id) and plumarc.is_platform_admin());

create policy manage_read on plumarc.users for select to plumarc_api
    using (exists (
        select 1 from plumarc.organization_members m
        where m.user_id = users.id and plumarc.can_manage(m.org_id)
    ));

create policy manage_read on plumarc.organization_members for select to plumarc_api
    using (plumarc.can_manage(org_id));
create policy manage_update on plumarc.organization_members for update to plumarc_api
    using (plumarc.can_manage(org_id)) with check (plumarc.can_manage(org_id));
create policy manage_delete on plumarc.organization_members for delete to plumarc_api
    using (plumarc.can_manage(org_id));

create policy manage_all on plumarc.documents to plumarc_api
    using (plumarc.can_manage(org_id)) with check (plumarc.can_manage(org_id));
create policy manage_all on plumarc.document_permissions to plumarc_api
    using (plumarc.can_manage(org_id)) with check (plumarc.can_manage(org_id));

grant select, insert, delete on plumarc.organizations to plumarc_api;
grant select on plumarc.users to plumarc_api;
grant update (role), delete on plumarc.organization_members to plumarc_api;
grant insert, update (title, classification), delete on plumarc.documents to plumarc_api;
grant insert, delete on plumarc.document_permissions to plumarc_api;

commit;
