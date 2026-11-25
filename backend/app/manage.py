"""Management of organizations, members and documents.

The auth service decides who may call these routes. Row-level security checks
again, from the database's own records, so a wrong principal still changes nothing.
"""

import re
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Annotated, Literal
from uuid import UUID, uuid4

import psycopg
from fastapi import APIRouter, Depends, HTTPException
from plumarc_shared.db import Database
from plumarc_shared.principal import Principal
from psycopg.rows import dict_row
from pydantic import BaseModel, StringConstraints

from app.auth import require
from app.database import get_database

router = APIRouter(prefix="/v1/admin/organizations")

Role = Literal["customer", "intern", "employee", "manager", "hr", "admin"]
Classification = Literal["public", "internal", "restricted"]
# No control characters: PostgreSQL rejects NUL, and names are single lines.
Text = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=200, pattern=r"^[^\x00-\x1f]+$"
    ),
]
# Auth0 user IDs look like "auth0|abc" or "google-oauth2|123".
UserSub = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, max_length=255, pattern=r"^[A-Za-z0-9._-]+\|[^\s\x00-\x1f]+$"
    ),
]


class Organization(BaseModel):
    id: UUID
    name: str


class Member(BaseModel):
    user_id: UUID
    user_sub: str
    display_name: str
    role: Role


class ManagedDocument(BaseModel):
    id: UUID
    title: str
    classification: Classification
    roles: list[Role]


class OrganizationDetail(Organization):
    members: list[Member]
    documents: list[ManagedDocument]


class NewOrganization(BaseModel):
    name: Text


class NewMember(BaseModel):
    user_sub: UserSub
    display_name: Text
    role: Role


class MemberRole(BaseModel):
    role: Role


class DocumentInput(BaseModel):
    title: Text
    classification: Classification
    roles: set[Role] = set()


manager = require("organization:manage", member=False)
platform = require("platform:manage", member=False)


def own_organization(org_id: UUID, principal: Principal = Depends(manager)) -> Principal:
    """Organization admins stay inside their organization. Others' look missing."""
    own = principal.membership and principal.membership.org_id == org_id
    if not (principal.platform_admin or own):
        raise HTTPException(404, "not_found")
    return principal


@contextmanager
def managing(
    db: Database, principal: Principal, org_id: UUID | None = None
) -> Iterator[psycopg.Cursor]:
    """A transaction with management rights. With org_id, that organization must be visible."""
    with db.scope(user_id=principal.user_id, manage="on") as conn:
        cursor = conn.cursor(row_factory=dict_row)
        if (
            org_id
            and not cursor.execute(
                "select 1 from plumarc.organizations where id = %s", (org_id,)
            ).fetchone()
        ):
            raise HTTPException(404, "not_found")
        yield cursor


def expect_row(cursor: psycopg.Cursor) -> None:
    if cursor.rowcount == 0:
        raise HTTPException(404, "not_found")


@router.get("")
def list_organizations(
    principal: Principal = Depends(manager), db: Database = Depends(get_database)
) -> list[Organization]:
    with managing(db, principal) as cursor:
        return cursor.execute("select id, name from plumarc.organizations order by name").fetchall()


@router.post("", status_code=201)
def create_organization(
    body: NewOrganization,
    principal: Principal = Depends(platform),
    db: Database = Depends(get_database),
) -> Organization:
    slug = re.sub(r"[^a-z0-9]+", "-", body.name.lower()).strip("-") or uuid4().hex
    try:
        with managing(db, principal) as cursor:
            return cursor.execute(
                "insert into plumarc.organizations (name, slug) values (%s, %s) returning id, name",
                (body.name, slug),
            ).fetchone()
    except psycopg.errors.UniqueViolation:
        raise HTTPException(409, "name_taken") from None


@router.get("/{org_id}")
def organization(
    org_id: UUID,
    principal: Principal = Depends(own_organization),
    db: Database = Depends(get_database),
) -> OrganizationDetail:
    with managing(db, principal, org_id) as cursor:
        name = cursor.execute(
            "select name from plumarc.organizations where id = %s", (org_id,)
        ).fetchone()["name"]
        members = cursor.execute(
            """
            select u.id as user_id, u.auth0_sub as user_sub, u.display_name, m.role::text
            from plumarc.organization_members m
            join plumarc.users u on u.id = m.user_id
            where m.org_id = %s
            order by u.display_name, u.id
            """,
            (org_id,),
        ).fetchall()
        documents = cursor.execute(
            """
            select d.id, d.title, d.classification,
                   coalesce(array_agg(p.role::text order by p.role)
                            filter (where p.role is not null), '{}') as roles
            from plumarc.documents d
            left join plumarc.document_permissions p on p.document_id = d.id
            where d.org_id = %s
            group by d.id
            order by d.title, d.id
            """,
            (org_id,),
        ).fetchall()
    return OrganizationDetail(id=org_id, name=name, members=members, documents=documents)


@router.delete("/{org_id}", status_code=204)
def delete_organization(
    org_id: UUID,
    principal: Principal = Depends(platform),
    db: Database = Depends(get_database),
) -> None:
    with managing(db, principal) as cursor:
        cursor.execute("delete from plumarc.organizations where id = %s", (org_id,))
        expect_row(cursor)


@router.post("/{org_id}/members", status_code=201)
def add_member(
    org_id: UUID,
    body: NewMember,
    principal: Principal = Depends(own_organization),
    db: Database = Depends(get_database),
) -> None:
    try:
        with managing(db, principal, org_id) as cursor:
            cursor.execute(
                "select plumarc.add_member(%s, %s, %s, %s::plumarc.member_role)",
                (org_id, body.user_sub, body.display_name, body.role),
            )
    except psycopg.errors.UniqueViolation:
        raise HTTPException(409, "already_member") from None


def not_own_membership(principal: Principal, user_id: UUID) -> None:
    """Stops an organization admin from locking themselves out."""
    if user_id == principal.user_id and not principal.platform_admin:
        raise HTTPException(409, "own_membership")


@router.patch("/{org_id}/members/{user_id}", status_code=204)
def change_role(
    org_id: UUID,
    user_id: UUID,
    body: MemberRole,
    principal: Principal = Depends(own_organization),
    db: Database = Depends(get_database),
) -> None:
    not_own_membership(principal, user_id)
    with managing(db, principal, org_id) as cursor:
        cursor.execute(
            "update plumarc.organization_members set role = %s::plumarc.member_role "
            "where org_id = %s and user_id = %s",
            (body.role, org_id, user_id),
        )
        expect_row(cursor)


@router.delete("/{org_id}/members/{user_id}", status_code=204)
def remove_member(
    org_id: UUID,
    user_id: UUID,
    principal: Principal = Depends(own_organization),
    db: Database = Depends(get_database),
) -> None:
    not_own_membership(principal, user_id)
    with managing(db, principal, org_id) as cursor:
        cursor.execute(
            "delete from plumarc.organization_members where org_id = %s and user_id = %s",
            (org_id, user_id),
        )
        expect_row(cursor)


def grant_roles(cursor: psycopg.Cursor, org_id: UUID, document_id: UUID, roles: set[str]) -> None:
    """Replace the role grants. Grants to individual members are left alone."""
    cursor.execute(
        "delete from plumarc.document_permissions where document_id = %s and role is not null",
        (document_id,),
    )
    cursor.executemany(
        "insert into plumarc.document_permissions (org_id, document_id, role) "
        "values (%s, %s, %s::plumarc.member_role)",
        [(org_id, document_id, role) for role in sorted(roles)],
    )


@router.post("/{org_id}/documents", status_code=201)
def create_document(
    org_id: UUID,
    body: DocumentInput,
    principal: Principal = Depends(own_organization),
    db: Database = Depends(get_database),
) -> None:
    with managing(db, principal, org_id) as cursor:
        document_id = cursor.execute(
            "insert into plumarc.documents (org_id, title, classification) "
            "values (%s, %s, %s) returning id",
            (org_id, body.title, body.classification),
        ).fetchone()["id"]
        grant_roles(cursor, org_id, document_id, body.roles)


@router.put("/{org_id}/documents/{document_id}", status_code=204)
def update_document(
    org_id: UUID,
    document_id: UUID,
    body: DocumentInput,
    principal: Principal = Depends(own_organization),
    db: Database = Depends(get_database),
) -> None:
    with managing(db, principal, org_id) as cursor:
        cursor.execute(
            "update plumarc.documents set title = %s, classification = %s "
            "where id = %s and org_id = %s",
            (body.title, body.classification, document_id, org_id),
        )
        expect_row(cursor)
        grant_roles(cursor, org_id, document_id, body.roles)


@router.delete("/{org_id}/documents/{document_id}", status_code=204)
def delete_document(
    org_id: UUID,
    document_id: UUID,
    principal: Principal = Depends(own_organization),
    db: Database = Depends(get_database),
) -> None:
    with managing(db, principal, org_id) as cursor:
        cursor.execute(
            "delete from plumarc.documents where id = %s and org_id = %s", (document_id, org_id)
        )
        expect_row(cursor)
