-- Synthetic demo data for two organizations. Safe to run more than once.

insert into plumarc.organizations (id, name, slug) values
    ('10000000-0000-0000-0000-000000000001', 'Northwind', 'northwind'),
    ('10000000-0000-0000-0000-000000000002', 'Globex', 'globex')
on conflict do nothing;

insert into plumarc.users (id, auth0_sub, display_name) values
    ('20000000-0000-0000-0000-000000000001', 'seed|northwind-intern', 'Asha Rao'),
    ('20000000-0000-0000-0000-000000000002', 'seed|northwind-hr', 'Dev Menon'),
    ('20000000-0000-0000-0000-000000000003', 'seed|northwind-customer', 'Lena Fischer'),
    ('20000000-0000-0000-0000-000000000004', 'seed|globex-employee', 'Marco Ruiz')
on conflict do nothing;

insert into plumarc.organization_members (org_id, user_id, role) values
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'intern'),
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'hr'),
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'customer'),
    ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004', 'employee')
on conflict do nothing;

insert into plumarc.documents (id, org_id, title, classification) values
    ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Refund policy', 'public'),
    ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Employee handbook', 'internal'),
    ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Salary bands', 'restricted'),
    ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', 'Globex handbook', 'internal')
on conflict do nothing;

-- Grants are inserted only once because the table has no natural unique key.
insert into plumarc.document_permissions (org_id, document_id, role)
select d.org_id, d.id, g.role::plumarc.member_role
from (values
    ('30000000-0000-0000-0000-000000000001', 'customer'),
    ('30000000-0000-0000-0000-000000000001', 'intern'),
    ('30000000-0000-0000-0000-000000000001', 'employee'),
    ('30000000-0000-0000-0000-000000000001', 'manager'),
    ('30000000-0000-0000-0000-000000000001', 'hr'),
    ('30000000-0000-0000-0000-000000000001', 'admin'),
    ('30000000-0000-0000-0000-000000000002', 'intern'),
    ('30000000-0000-0000-0000-000000000002', 'employee'),
    ('30000000-0000-0000-0000-000000000002', 'manager'),
    ('30000000-0000-0000-0000-000000000002', 'hr'),
    ('30000000-0000-0000-0000-000000000003', 'hr'),
    ('30000000-0000-0000-0000-000000000004', 'employee')
) as g (document_id, role)
join plumarc.documents d on d.id = g.document_id::uuid
where not exists (
    select 1 from plumarc.document_permissions p
    where p.document_id = d.id and p.role = g.role::plumarc.member_role
);
