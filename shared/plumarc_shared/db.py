"""Database access that keeps row-level security in force."""

from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from psycopg_pool import ConnectionPool

# Superusers, BYPASSRLS roles and table owners can all get around the policies.
_CAN_BYPASS_RLS = """
select r.rolsuper or r.rolbypassrls or exists (
    select 1 from pg_tables t
    where t.schemaname = 'plumarc' and pg_has_role(current_user, t.tableowner, 'member')
)
from pg_roles r
where r.rolname = current_user
"""


class UnsafeDatabaseRole(RuntimeError):
    pass


def ensure_rls_applies(conn: psycopg.Connection) -> None:
    if conn.execute(_CAN_BYPASS_RLS).fetchone()[0]:
        raise UnsafeDatabaseRole(
            "This database role can bypass row-level security. "
            "Connect as plumarc_api or plumarc_auth."
        )


def set_scope(conn: psycopg.Connection, **settings: object) -> None:
    """Set app.* values read by the policies, for the current transaction only."""
    for name, value in settings.items():
        conn.execute("select set_config(%s, %s, true)", (f"app.{name}", str(value)))


class Database:
    def __init__(self, url: str) -> None:
        self._pool = ConnectionPool(
            url,
            min_size=1,
            max_size=5,
            timeout=5,
            open=True,
            configure=ensure_rls_applies,
            check=ConnectionPool.check_connection,
            # prepare_threshold=None keeps transaction-mode poolers working.
            kwargs={"autocommit": True, "prepare_threshold": None, "connect_timeout": 5},
        )

    @contextmanager
    def scope(self, **settings: object) -> Iterator[psycopg.Connection]:
        with self._pool.connection() as conn, conn.transaction():
            set_scope(conn, **settings)
            yield conn

    def close(self) -> None:
        self._pool.close()
