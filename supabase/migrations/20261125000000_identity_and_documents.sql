-- Identity, organizations and document permissions.
-- Run once as the database owner. Everything lives in its own schema so that
-- Supabase's public REST API does not expose it.

create schema plumarc;
revoke all on schema plumarc from public;

-- Application roles. They get a password and LOGIN by hand, never in a migration.
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'plumarc_api') then
        create role plumarc_api nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'plumarc_auth') then
        create role plumarc_auth nologin;
    end if;
end $$;

create type plumarc.member_role as enum
    ('customer', 'intern', 'employee', 'manager', 'hr', 'admin');

create table plumarc.organizations (
    id   uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null unique
);

create table plumarc.users (
    id           uuid primary key default gen_random_uuid(),
    auth0_sub    text not null unique,
    display_name text not null
);

create table plumarc.organization_members (
    org_id  uuid not null references plumarc.organizations on delete cascade,
    user_id uuid not null references plumarc.users on delete cascade,
    role    plumarc.member_role not null,
    primary key (org_id, user_id),
    -- shortcut: one organization per user; drop this when an organization switcher exists.
    unique (user_id)
);

create table plumarc.documents (
    id             uuid primary key default gen_random_uuid(),
    org_id         uuid not null references plumarc.organizations on delete cascade,
    title          text not null,
    classification text not null
        check (classification in ('public', 'internal', 'restricted')),
    unique (id, org_id)
);

-- A grant is for one role or one member. The composite keys stop a grant from
-- pointing at another organization's document or member.
create table plumarc.document_permissions (
    id          bigint generated always as identity primary key,
    org_id      uuid not null,
    document_id uuid not null,
    role        plumarc.member_role,
    user_id     uuid,
    foreign key (document_id, org_id)
        references plumarc.documents (id, org_id) on delete cascade,
    foreign key (org_id, user_id)
        references plumarc.organization_members (org_id, user_id) on delete cascade,
    check (num_nonnulls(role, user_id) = 1)
);

create index on plumarc.documents (org_id);
create index on plumarc.document_permissions (document_id);

-- Request context, set by the services for one transaction at a time.
create function plumarc.current_user_id() returns uuid language sql stable
    as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
create function plumarc.current_org_id() returns uuid language sql stable
    as $$ select nullif(current_setting('app.org_id', true), '')::uuid $$;

alter table plumarc.organizations        enable row level security;
alter table plumarc.users                enable row level security;
alter table plumarc.organization_members enable row level security;
alter table plumarc.documents            enable row level security;
alter table plumarc.document_permissions enable row level security;

alter table plumarc.organizations        force row level security;
alter table plumarc.users                force row level security;
alter table plumarc.organization_members force row level security;
alter table plumarc.documents            force row level security;
alter table plumarc.document_permissions force row level security;

-- The auth service finds exactly the user named by a verified token.
create policy own_account on plumarc.users for select to plumarc_auth
    using (auth0_sub = nullif(current_setting('app.auth0_sub', true), ''));

create policy own_membership on plumarc.organization_members
    for select to plumarc_auth, plumarc_api
    using (user_id = plumarc.current_user_id());

create policy member_organization on plumarc.organizations
    for select to plumarc_auth
    using (exists (
        select 1 from plumarc.organization_members m
        where m.org_id = organizations.id and m.user_id = plumarc.current_user_id()
    ));

-- Only grants that apply to the caller, inside the active organization.
create policy own_grants on plumarc.document_permissions for select to plumarc_api
    using (
        org_id = plumarc.current_org_id()
        and exists (
            select 1 from plumarc.organization_members m
            where m.org_id = document_permissions.org_id
              and m.user_id = plumarc.current_user_id()
              and (m.role = document_permissions.role
                   or m.user_id = document_permissions.user_id)
        )
    );

-- A document is visible when at least one visible grant points at it.
create policy granted_documents on plumarc.documents for select to plumarc_api
    using (
        org_id = plumarc.current_org_id()
        and exists (
            select 1 from plumarc.document_permissions p
            where p.document_id = documents.id and p.org_id = documents.org_id
        )
    );

grant usage on schema plumarc to plumarc_api, plumarc_auth;
grant select on plumarc.users, plumarc.organizations, plumarc.organization_members
    to plumarc_auth;
grant select on plumarc.organization_members, plumarc.documents,
    plumarc.document_permissions to plumarc_api;
