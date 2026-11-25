import psycopg
import pytest
from plumarc_shared.db import Database, UnsafeDatabaseRole, ensure_rls_applies

from app.main import app, get_database, get_verifier
from app.policy import allowed_actions
from app.token import KeysUnavailable


def get_principal(client, token):
    return client.get("/v1/principal", headers={"Authorization": f"Bearer {token}"})


def test_member_gets_organization_role_and_actions(client, make_token):
    body = get_principal(client, make_token("seed|northwind-intern")).json()
    assert body["membership"]["org_name"] == "Northwind"
    assert body["membership"]["role"] == "intern"
    assert body["actions"] == ["documents:list"]


def test_roles_come_from_the_database_not_the_token(client, make_token):
    token = make_token("seed|northwind-intern", role="admin", org_id="globex")
    assert get_principal(client, token).json()["membership"]["role"] == "intern"


def test_unknown_user_gets_nothing(client, make_token):
    body = get_principal(client, make_token("auth0|stranger")).json()
    assert body == {
        "sub": "auth0|stranger",
        "user_id": None,
        "membership": None,
        "platform_admin": False,
        "actions": [],
    }


def test_organization_admin_may_manage_but_not_the_platform(client, make_token, database_url):
    update = (
        "update plumarc.organization_members set role = %s "
        "where user_id = '20000000-0000-0000-0000-000000000002'"
    )
    with psycopg.connect(database_url, autocommit=True) as admin:
        admin.execute(update, ("admin",))
        try:
            body = get_principal(client, make_token("seed|northwind-hr")).json()
        finally:
            admin.execute(update, ("hr",))
    assert body["platform_admin"] is False
    assert body["actions"] == ["documents:list", "organization:manage"]


def test_platform_admin_without_organization_may_manage(client, make_token, database_url):
    with psycopg.connect(database_url, autocommit=True) as admin:
        admin.execute(
            "insert into plumarc.users (auth0_sub, display_name, is_platform_admin) "
            "values ('auth0|root', 'Root', true)"
        )
        try:
            body = get_principal(client, make_token("auth0|root")).json()
        finally:
            admin.execute("delete from plumarc.users where auth0_sub = 'auth0|root'")
    assert body["platform_admin"] is True and body["membership"] is None
    assert body["actions"] == ["organization:manage", "platform:manage"]


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer junk"}])
def test_missing_or_bad_token_is_401(client, headers):
    response = client.get("/v1/principal", headers=headers)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_expired_token_is_401(client, make_token):
    assert get_principal(client, make_token(exp=1)).status_code == 401


def test_unreachable_signing_keys_fail_closed(client, make_token):
    class Offline:
        def subject(self, _):
            raise KeysUnavailable

    app.dependency_overrides[get_verifier] = Offline
    assert get_principal(client, make_token()).status_code == 503


def test_database_failure_fails_closed(client, make_token):
    class Broken:
        def scope(self, **_):
            raise psycopg.OperationalError("down")

    app.dependency_overrides[get_database] = Broken
    assert get_principal(client, make_token()).status_code == 503


def test_unlisted_role_has_no_actions():
    assert allowed_actions("stranger") == []


def test_auth_role_cannot_list_users_or_read_documents(database):
    with database.scope() as conn:
        assert conn.execute("select count(*) from plumarc.users").fetchone()[0] == 0
    with pytest.raises(psycopg.errors.InsufficientPrivilege), database.scope() as conn:
        conn.execute("select * from plumarc.documents")


def test_scope_does_not_leak_into_the_next_request(database):
    with database.scope(auth0_sub="seed|northwind-intern") as conn:
        assert conn.execute("select count(*) from plumarc.users").fetchone()[0] == 1
    for _ in range(6):  # more than the pool size, so connections are reused
        with database.scope() as conn:
            assert conn.execute("select count(*) from plumarc.users").fetchone()[0] == 0


def test_refuses_a_role_that_bypasses_security(database_url):
    with psycopg.connect(database_url) as conn, pytest.raises(UnsafeDatabaseRole):
        ensure_rls_applies(conn)


def test_pool_never_hands_out_an_unsafe_connection(database_url):
    db = Database(database_url)
    db._pool.timeout = 1
    try:
        with pytest.raises(Exception, match="couldn't get a connection"), db.scope():
            pass
    finally:
        db.close()
