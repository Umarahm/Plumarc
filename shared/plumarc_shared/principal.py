"""The contract between the auth service and its callers."""

from uuid import UUID

from pydantic import BaseModel


class Membership(BaseModel):
    org_id: UUID
    org_name: str
    role: str


class Principal(BaseModel):
    sub: str
    user_id: UUID | None = None
    membership: Membership | None = None
    platform_admin: bool = False
    actions: list[str] = []
