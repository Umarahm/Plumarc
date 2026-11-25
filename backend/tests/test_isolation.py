"""Row-level security, exercised through the same database role the API uses."""

import psycopg
import pytest
from conftest import GLOBEX, NORTHWIND, member, user

from app.database import get_database
from app.main import app

TABLES = ["organization_members", "documents", "document_permissions"]


@pytest.mark.parametrize(
    ("principal", "titles"),
    [
        (member(1, "intern"), ["Employee handbook", "Refund policy"]),
        (member(2, "hr"), ["Employee handbook", "Refund policy", "Salary bands"]),
        (member(3, "customer"), ["Refund policy"]),
        (member(4, "employee", GLOBEX), ["Globex handbook"]),
    ],
    ids=["intern", "hr", "customer", "other-tenant"],
)
def test_each_member_sees_only_granted_documents(client, signed_in, principal, titles):
    response = client.get("/v1/documents", headers=signed_in(principal))
    assert [d["title"] for d in response.json()] == titles


@pytest.mark.parametrize(
    "principal",
    [member(1, "intern", GLOBEX), member(4, "employee", NORTHWIND)],
    ids=["northwind-user-in-globex", "globex-user-in-northwind"],
)
def test_claiming_another_organization_returns_nothing(client, signed_in, principal):
    response = client.get("/v1/documents", headers=signed_in(principal))
    assert response.json() == []


def test_claiming_a_higher_role_changes_nothing(client, signed_in):
    """The database reads the role from the membership row, not from the request."""
    response = client.get("/v1/documents", headers=signed_in(member(1, "hr")))
    assert "Salary bands" not in [d["title"] for d in response.json()]


@pytest.mark.parametrize("table", TABLES)
def test_no_scope_means_no_rows(database, table):
    with database.scope() as conn:
        assert conn.execute(f"select count(*) from plumarc.{table}").fetchone()[0] == 0


@pytest.mark.parametrize("table", TABLES)
def test_no_rows_ever_cross_tenants(database, table):
    with database.scope(user_id=user(4), org_id=NORTHWIND) as conn:
        rows = conn.execute(
            f"select count(*) from plumarc.{table} where org_id <> %s", (GLOBEX,)
        ).fetchone()[0]
    assert rows == 0


def test_a_grant_to_one_member_is_visible_only_to_that_member(database, database_url):
    document = "30000000-0000-0000-0000-000000000003"
    with psycopg.connect(database_url, autocommit=True) as admin:
        grant = admin.execute(
            "insert into plumarc.document_permissions (org_id, document_id, user_id) "
            "values (%s, %s, %s) returning id",
            (NORTHWIND, document, user(1)),
        ).fetchone()[0]
        try:
            query = "select count(*) from plumarc.documents where id = %s"
            for number, expected in [(1, 1), (3, 0)]:
                with database.scope(user_id=user(number), org_id=NORTHWIND) as conn:
                    assert conn.execute(query, (document,)).fetchone()[0] == expected
        finally:
            admin.execute("delete from plumarc.document_permissions where id = %s", (grant,))


def test_grants_cannot_point_across_organizations(database_url):
    with psycopg.connect(database_url) as admin:
        with pytest.raises(psycopg.errors.ForeignKeyViolation):
            admin.execute(
                "insert into plumarc.document_permissions (org_id, document_id, role) "
                "values (%s, '30000000-0000-0000-0000-000000000001', 'employee')",
                (GLOBEX,),
            )


@pytest.mark.parametrize(
    "statement",
    [
        "insert into plumarc.documents (org_id, title, classification) "
        "values (gen_random_uuid(), 'x', 'public')",
        "update plumarc.users set is_platform_admin = true",
        "update plumarc.documents set org_id = gen_random_uuid()",
        "alter table plumarc.documents disable row level security",
        "set role plumarc_auth",
    ],
)
def test_api_role_cannot_write_or_escalate(database, statement):
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with database.scope(user_id=user(1), org_id=NORTHWIND) as conn:
            conn.execute(statement)


@pytest.mark.parametrize("manage", ["", "on"], ids=["ordinary", "claims-management"])
@pytest.mark.parametrize(
    "statement",
    [
        "update plumarc.organization_members set role = 'admin'",
        "delete from plumarc.organization_members",
        "delete from plumarc.document_permissions",
        "update plumarc.documents set title = 'x'",
        "delete from plumarc.documents",
        "delete from plumarc.organizations",
        "select * from plumarc.users",
    ],
)
def test_ordinary_member_changes_nothing(database, statement, manage):
    """Even with app.manage on, the database checks who is asking."""
    with database.scope(user_id=user(1), org_id=NORTHWIND, manage=manage) as conn:
        assert conn.execute(statement).rowcount == 0


@pytest.mark.parametrize(
    "statement",
    [
        "insert into plumarc.organizations (name, slug) values ('x', 'x')",
        "select plumarc.add_member('10000000-0000-0000-0000-000000000001', "
        "'auth0|x', 'x', 'admin')",
    ],
)
def test_ordinary_member_cannot_create(database, statement):
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with database.scope(user_id=user(1), org_id=NORTHWIND, manage="on") as conn:
            conn.execute(statement)


def test_every_table_forces_row_level_security(database_url):
    with psycopg.connect(database_url) as admin:
        unprotected = admin.execute(
            "select relname from pg_class where relnamespace = 'plumarc'::regnamespace "
            "and relkind = 'r' and not (relrowsecurity and relforcerowsecurity)"
        ).fetchall()
    assert unprotected == []


def test_database_failure_is_503(client, signed_in):
    class Broken:
        def scope(self, **_):
            raise psycopg.OperationalError("down")

    app.dependency_overrides[get_database] = Broken
    response = client.get("/v1/documents", headers=signed_in(member(1, "intern")))
    assert response.status_code == 503
