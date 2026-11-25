from plumarc_shared.db import Database, set_scope
from plumarc_shared.principal import Membership, Principal

from app.policy import allowed_actions


def load_principal(db: Database, sub: str) -> Principal:
    """Read on every request, so removing a role takes effect immediately."""
    with db.scope(auth0_sub=sub) as conn:
        user = conn.execute(
            "select id, is_platform_admin from plumarc.users where auth0_sub = %s", (sub,)
        ).fetchone()
        if user is None:
            return Principal(sub=sub)

        user_id, platform_admin = user
        set_scope(conn, user_id=user_id)
        row = conn.execute(
            """
            select m.org_id, o.name, m.role::text
            from plumarc.organization_members m
            join plumarc.organizations o on o.id = m.org_id
            where m.user_id = %s
            """,
            (user_id,),
        ).fetchone()

    membership = Membership(org_id=row[0], org_name=row[1], role=row[2]) if row else None
    roles = [membership.role] if membership else []
    if platform_admin:
        roles.append("platform_admin")
    return Principal(
        sub=sub,
        user_id=user_id,
        membership=membership,
        platform_admin=platform_admin,
        actions=allowed_actions(*roles),
    )
