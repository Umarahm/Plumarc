"""Management routes against the real database rules."""

from types import SimpleNamespace
from uuid import UUID, uuid4

import psycopg
import pytest
from plumarc_shared.principal import Membership, Principal

BASE = "/v1/admin/organizations"


@pytest.fixture
def world(database_url):
    """A platform admin, and two organizations, the first with its own admin."""
    run = uuid4().hex[:8]
    made = SimpleNamespace(run=run)
    with psycopg.connect(database_url, autocommit=True) as db:

        def add_user(label, platform=False):
            return db.execute(
                "insert into plumarc.users (auth0_sub, display_name, is_platform_admin) "
                "values (%s, %s, %s) returning id",
                (f"test|{run}-{label}", label, platform),
            ).fetchone()[0]

        def add_org(label):
            return db.execute(
                "insert into plumarc.organizations (name, slug) values (%s, %s) returning id",
                (f"{label} {run}", f"{label}-{run}"),
            ).fetchone()[0]

        made.root, made.boss = add_user("root", platform=True), add_user("boss")
        made.mine, made.other = add_org("mine"), add_org("other")
        db.execute(
            "insert into plumarc.organization_members values (%s, %s, 'admin')",
            (made.mine, made.boss),
        )
        yield made
        db.execute("delete from plumarc.organizations where name ilike %s", (f"%{run}",))
        db.execute("delete from plumarc.users where auth0_sub like %s", (f"test|{run}-%",))


def platform_admin(user_id: UUID) -> Principal:
    return Principal(
        sub="test|root",
        user_id=user_id,
        platform_admin=True,
        actions=["organization:manage", "platform:manage"],
    )


def org_admin(user_id: UUID, org_id: UUID) -> Principal:
    return Principal(
        sub="test|boss",
        user_id=user_id,
        membership=Membership(org_id=org_id, org_name="x", role="admin"),
        actions=["documents:list", "organization:manage"],
    )


def new_member(world, label="new", role="employee"):
    return {"user_sub": f"test|{world.run}-{label}", "display_name": label, "role": role}


def test_platform_admin_manages_a_whole_organization(client, signed_in, world):
    headers = signed_in(platform_admin(world.root))
    created = client.post(BASE, json={"name": f"  Acme {world.run} "}, headers=headers)
    assert created.status_code == 201
    url = f"{BASE}/{created.json()['id']}"
    assert created.json()["name"] == f"Acme {world.run}"

    member = new_member(world, role="admin")
    assert client.post(f"{url}/members", json=member, headers=headers).status_code == 201
    document = {"title": "Leave policy", "classification": "internal", "roles": ["intern", "hr"]}
    assert client.post(f"{url}/documents", json=document, headers=headers).status_code == 201

    detail = client.get(url, headers=headers).json()
    [added], [saved] = detail["members"], detail["documents"]
    assert added["user_sub"] == member["user_sub"] and added["role"] == "admin"
    assert saved["roles"] == ["intern", "hr"]

    member_url = f"{url}/members/{added['user_id']}"
    assert client.patch(member_url, json={"role": "hr"}, headers=headers).status_code == 204
    changed = {"title": "Leave", "classification": "public", "roles": ["customer"]}
    document_url = f"{url}/documents/{saved['id']}"
    assert client.put(document_url, json=changed, headers=headers).status_code == 204
    detail = client.get(url, headers=headers).json()
    assert detail["members"][0]["role"] == "hr"
    assert detail["documents"][0] == {"id": saved["id"], **changed}

    assert client.delete(document_url, headers=headers).status_code == 204
    assert client.delete(member_url, headers=headers).status_code == 204
    assert client.delete(member_url, headers=headers).status_code == 404
    assert client.delete(url, headers=headers).status_code == 204
    assert client.get(url, headers=headers).status_code == 404


def test_platform_admin_lists_every_organization(client, signed_in, world):
    response = client.get(BASE, headers=signed_in(platform_admin(world.root)))
    assert {str(world.mine), str(world.other)} <= {o["id"] for o in response.json()}


def test_organization_admin_stays_inside_their_organization(client, signed_in, world):
    headers = signed_in(org_admin(world.boss, world.mine))
    assert [o["id"] for o in client.get(BASE, headers=headers).json()] == [str(world.mine)]
    assert client.get(f"{BASE}/{world.mine}", headers=headers).status_code == 200
    document = {"title": "x", "classification": "public", "roles": []}
    for response in [
        client.get(f"{BASE}/{world.other}", headers=headers),
        client.post(f"{BASE}/{world.other}/members", json=new_member(world), headers=headers),
        client.post(f"{BASE}/{world.other}/documents", json=document, headers=headers),
    ]:
        assert response.status_code == 404
    assert client.post(BASE, json={"name": "x"}, headers=headers).status_code == 403
    assert client.delete(f"{BASE}/{world.mine}", headers=headers).status_code == 403


def test_organization_admin_cannot_lock_themselves_out(client, signed_in, world):
    headers = signed_in(org_admin(world.boss, world.mine))
    url = f"{BASE}/{world.mine}/members/{world.boss}"
    response = client.patch(url, json={"role": "intern"}, headers=headers)
    assert response.json() == {"detail": "own_membership"}
    assert client.delete(url, headers=headers).status_code == 409


def test_database_rejects_a_forged_platform_admin(client, signed_in, world):
    """The auth service could be wrong; the database still checks its own records."""
    headers = signed_in(platform_admin(world.boss))
    assert client.post(BASE, json={"name": f"x {world.run}"}, headers=headers).status_code == 403
    assert client.get(f"{BASE}/{world.other}", headers=headers).status_code == 404
    assert client.delete(f"{BASE}/{world.mine}", headers=headers).status_code == 404
    members = f"{BASE}/{world.other}/members"
    assert client.post(members, json=new_member(world), headers=headers).status_code == 404


def test_adding_someone_elsewhere_neither_moves_nor_renames_them(
    client, signed_in, world, database_url
):
    headers = signed_in(platform_admin(world.root))
    taken = {"user_sub": f"test|{world.run}-boss", "display_name": "Renamed", "role": "intern"}
    response = client.post(f"{BASE}/{world.other}/members", json=taken, headers=headers)
    assert response.status_code == 409 and response.json() == {"detail": "already_member"}
    with psycopg.connect(database_url) as db:
        row = db.execute(
            "select u.display_name, m.org_id from plumarc.users u "
            "join plumarc.organization_members m on m.user_id = u.id where u.id = %s",
            (world.boss,),
        ).fetchone()
    assert row == ("boss", world.mine)


def test_duplicate_organization_name_is_409(client, signed_in, world):
    headers = signed_in(platform_admin(world.root))
    response = client.post(BASE, json={"name": f"mine {world.run}"}, headers=headers)
    assert response.status_code == 409 and response.json() == {"detail": "name_taken"}


def test_document_ids_from_another_organization_are_not_found(client, signed_in, world):
    headers = signed_in(platform_admin(world.root))
    globex_document = "30000000-0000-0000-0000-000000000004"
    url = f"{BASE}/{world.mine}/documents/{globex_document}"
    body = {"title": "x", "classification": "public", "roles": []}
    assert client.put(url, json=body, headers=headers).status_code == 404
    assert client.delete(url, headers=headers).status_code == 404


def test_managing_does_not_widen_an_admins_own_document_list(client, signed_in, world):
    headers = signed_in(org_admin(world.boss, world.mine))
    document = {"title": "Secret", "classification": "restricted", "roles": ["hr"]}
    client.post(f"{BASE}/{world.mine}/documents", json=document, headers=headers)
    assert client.get("/v1/documents", headers=headers).json() == []
    detail = client.get(f"{BASE}/{world.mine}", headers=headers).json()
    assert len(detail["documents"]) == 1


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("", {"name": "   "}),
        ("", {"name": "a\u0000b"}),
        ("/members", {"user_sub": "no-separator", "display_name": "x", "role": "intern"}),
        ("/members", {"user_sub": "auth0|x", "display_name": "x", "role": "platform_admin"}),
        ("/documents", {"title": "x", "classification": "secret", "roles": []}),
        ("/documents", {"title": "x" * 201, "classification": "public", "roles": []}),
    ],
)
def test_bad_input_is_422(client, signed_in, world, path, body):
    headers = signed_in(platform_admin(world.root))
    url = f"{BASE}/{world.mine}{path}" if path else BASE
    assert client.post(url, json=body, headers=headers).status_code == 422


def test_callers_without_the_action_are_refused(client, signed_in, world):
    principal = org_admin(world.boss, world.mine).model_copy(update={"actions": []})
    headers = signed_in(principal)
    assert client.get(BASE, headers=headers).status_code == 403
    assert client.get(f"{BASE}/{world.mine}", headers=headers).status_code == 403
